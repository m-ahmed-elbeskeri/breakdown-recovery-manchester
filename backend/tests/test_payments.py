"""Card payments, cash deposits, the platform's cut, cash commission and driver payouts.

Stripe itself is replaced by a fake that behaves like it: holds, captures,
transfers and payouts are recorded so each rule can be checked.
"""

import json
import secrets

import pytest

from app import models, payments
from app.config import settings
from app.stripe_gateway import PaymentError


class FakeStripe:
    def __init__(self):
        self.n = 0
        self.intents: dict[str, dict] = {}
        self.calls: list[tuple] = []
        self.balance_value = {"available": 0, "pending": 0, "instant_available": 0}
        self.fail_transfers = False

    def _id(self, prefix: str) -> str:
        self.n += 1
        return f"{prefix}_{self.n}"

    def of(self, kind: str) -> list[tuple]:
        return [c for c in self.calls if c[0] == kind]

    # Customers
    def create_customer(self, *, metadata, idempotency_key):
        return self._id("cus")

    def create_payment_intent(self, *, amount, customer, capture_manually, save_card, description, metadata, idempotency_key):
        pid = self._id("pi")
        self.intents[pid] = {
            "id": pid, "client_secret": f"{pid}_secret", "amount": amount, "status": "requires_payment_method",
            "metadata": metadata, "payment_method": None, "latest_charge": None, "amount_received": 0,
            "capture_manually": capture_manually, "save_card": save_card,
        }
        self.calls.append(("intent", pid, amount, capture_manually))
        return dict(self.intents[pid])

    def customer_confirms(self, pid):
        self.intents[pid].update(status="requires_capture", payment_method="pm_card_visa")

    def retrieve_payment_intent(self, pid):
        return dict(self.intents[pid])

    def capture_payment_intent(self, pid, *, amount=None):
        intent = self.intents[pid]
        taken = amount or intent["amount"]
        intent.update(status="succeeded", amount_received=taken, latest_charge=f"ch_{pid}")
        self.calls.append(("capture", pid, taken))
        return dict(intent)

    def cancel_payment_intent(self, pid):
        self.intents[pid]["status"] = "canceled"
        self.calls.append(("cancel", pid))
        return dict(self.intents[pid])

    def charge_saved_card(self, *, amount, customer, payment_method, description, metadata, idempotency_key):
        pid = self._id("pi")
        self.intents[pid] = {"id": pid, "amount": amount, "status": "succeeded", "amount_received": amount,
                             "latest_charge": f"ch_{pid}", "payment_method": payment_method, "metadata": metadata}
        self.calls.append(("saved_card", pid, amount))
        return dict(self.intents[pid])

    def create_refund(self, *, payment_intent, amount, idempotency_key):
        self.calls.append(("refund", payment_intent, amount))
        return self._id("re")

    # Drivers
    def create_express_account(self, *, email, metadata, idempotency_key):
        self.calls.append(("account", email))
        return self._id("acct")

    def onboarding_link(self, *, account, refresh_url, return_url):
        self.calls.append(("onboarding", account, return_url))
        return f"https://connect.stripe.test/setup/{account}"

    def dashboard_link(self, account):
        return f"https://connect.stripe.test/express/{account}"

    def retrieve_account(self, account):
        return {"id": account, "details_submitted": True, "payouts_enabled": True}

    def create_transfer(self, *, amount, destination, source_transaction, metadata, idempotency_key):
        if self.fail_transfers:
            raise PaymentError("Insufficient funds in the platform's balance.")
        self.calls.append(("transfer", amount, destination, source_transaction))
        return self._id("tr")

    def balance(self, account):
        return dict(self.balance_value)

    def create_payout(self, *, account, amount, instant, idempotency_key):
        self.calls.append(("payout", account, amount, instant))
        return {"id": self._id("po"), "arrival_date": "2026-09-15"}

    def construct_event(self, payload, signature, secret):
        if signature != "signed-by-stripe":
            raise PaymentError("That webhook couldn't be verified.")
        return json.loads(payload)


@pytest.fixture
def stripe_fake(monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_fake")
    monkeypatch.setattr(settings, "stripe_publishable_key", "pk_test_fake")
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_fake")
    monkeypatch.setattr(settings, "platform_fee_percent", 20)
    fake = FakeStripe()
    payments.set_gateway(fake)
    yield fake
    payments.set_gateway(None)


def book(client, *, method="card", price=100, **over):
    body = {
        "requestId": secrets.token_hex(8), "region": "Manchester", "location": "Piccadilly, Manchester",
        "phone": "07911 123456", "service": "towing", "timing": "now", "price": price, "paymentMethod": method,
    }
    body.update(over)
    response = client.post("/api/bookings", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def track(client, token):
    return client.get(f"/api/track/{token}").json()


def move(client, headers, booking_id, *statuses, paid_in_person=False):
    response = None
    for status in statuses:
        body = {"status": status}
        if status == "complete" and paid_in_person:
            body["paidInPerson"] = True
        response = client.post(f"/api/me/jobs/{booking_id}/status", json=body, headers=headers)
    return response


def connect(session_factory, driver_id, account="acct_driver"):
    with session_factory() as db:
        driver = db.get(models.Driver, driver_id)
        driver.stripe_account_id = account
        driver.stripe_details_submitted = True
        driver.stripe_payouts_enabled = True
        db.commit()


def ledger(session_factory, driver_id):
    with session_factory() as db:
        return [
            (e.kind, e.amount_pence)
            for e in db.query(models.DriverLedgerEntry).filter_by(driver_id=driver_id).order_by(models.DriverLedgerEntry.id)
        ]


def hold_card(client, stripe_fake, token):
    started = client.post(f"/api/track/{token}/payment")
    assert started.status_code == 200, started.text
    pid = started.json()["clientSecret"].removesuffix("_secret")
    stripe_fake.customer_confirms(pid)
    assert client.post(f"/api/track/{token}/payment/sync").json()["status"] == "authorised"
    return pid


def test_without_stripe_keys_every_booking_pays_the_driver(client):
    created = book(client, method="card")
    assert created["paymentMethod"] == "cash"
    info = track(client, created["trackToken"])
    assert info["paymentMethod"] == "cash" and info["cardAvailable"] is False
    assert client.get("/api/payments/config").json()["enabled"] is False


def test_a_card_is_held_at_booking_and_charged_when_the_job_is_done(client, stripe_fake, driver_login, session_factory):
    created = book(client, price=100)
    assert created["paymentMethod"] == "card"
    started = client.post(f"/api/track/{created['trackToken']}/payment").json()
    assert started["amountPence"] == 10000 and started["publishableKey"] == "pk_test_fake"
    pid = started["clientSecret"].removesuffix("_secret")
    assert stripe_fake.intents[pid]["capture_manually"] is True
    assert stripe_fake.intents[pid]["save_card"] is True

    stripe_fake.customer_confirms(pid)
    client.post(f"/api/track/{created['trackToken']}/payment/sync")
    assert track(client, created["trackToken"])["paymentStatus"] == "authorised"
    assert not stripe_fake.of("capture"), "nothing is taken until the job is done"

    headers, driver_id = driver_login()
    connect(session_factory, driver_id)
    done = move(client, headers, created["bookingId"], "accepted", "en_route", "on_scene", "complete")
    assert done.status_code == 200, done.text
    job = done.json()
    assert job["paymentStatus"] == "paid"
    assert (job["amountPaidPence"], job["platformFeePence"], job["driverNetPence"]) == (10000, 2000, 8000)
    assert stripe_fake.of("capture") == [("capture", pid, 10000)]
    assert stripe_fake.of("transfer") == [("transfer", 8000, "acct_driver", f"ch_{pid}")]
    assert ledger(session_factory, driver_id) == [("card_earning", 8000), ("transfer", -8000)]


def test_a_driver_is_paid_what_they_are_owed_once_stripe_approves_them(client, stripe_fake, driver_login, session_factory):
    created = book(client, price=100)
    hold_card(client, stripe_fake, created["trackToken"])
    headers, driver_id = driver_login()
    move(client, headers, created["bookingId"], "accepted", "complete")
    assert client.get("/api/me/earnings", headers=headers).json()["balancePence"] == 8000
    assert not stripe_fake.of("transfer")

    link = client.post("/api/me/earnings/onboarding", headers={**headers, "Origin": "http://localhost:3000"})
    assert link.status_code == 200, link.text
    account = stripe_fake.of("account")
    assert len(account) == 1
    with session_factory() as db:
        account_id = db.get(models.Driver, driver_id).stripe_account_id

    event = {"id": "evt_account_ready", "type": "account.updated",
             "data": {"object": {"id": account_id, "details_submitted": True, "payouts_enabled": True}}}
    body = json.dumps(event)
    assert client.post("/api/payments/webhook", content=body, headers={"stripe-signature": "signed-by-stripe"}).status_code == 204
    # Delivered twice, as Stripe may: handled once.
    assert client.post("/api/payments/webhook", content=body, headers={"stripe-signature": "signed-by-stripe"}).status_code == 204
    assert stripe_fake.of("transfer") == [("transfer", 8000, account_id, None)]
    earnings = client.get("/api/me/earnings", headers=headers).json()
    assert earnings["balancePence"] == 0
    assert earnings["account"]["payoutsEnabled"] is True


def test_webhooks_must_be_signed_by_stripe(client, stripe_fake):
    body = json.dumps({"id": "evt_forged", "type": "account.updated", "data": {"object": {}}})
    assert client.post("/api/payments/webhook", content=body, headers={"stripe-signature": "made-up"}).status_code == 400


def test_a_cash_job_takes_the_cut_as_a_card_deposit(client, stripe_fake, driver_login, session_factory, admin_headers):
    created = book(client, method="cash", price=100)
    assert (created["paymentMethod"], created["depositPence"]) == ("cash", 2000)
    started = client.post(f"/api/track/{created['trackToken']}/payment").json()
    assert started["amountPence"] == 2000, "only the deposit goes on the card"
    pid = started["clientSecret"].removesuffix("_secret")
    assert stripe_fake.intents[pid]["capture_manually"] is True
    stripe_fake.customer_confirms(pid)
    client.post(f"/api/track/{created['trackToken']}/payment/sync")
    info = track(client, created["trackToken"])
    assert (info["paymentStatus"], info["depositPence"], info["cashToCollectPence"]) == ("authorised", 2000, 8000)
    assert not stripe_fake.of("capture"), "nothing is taken until the job is done"

    headers, driver_id = driver_login()
    connect(session_factory, driver_id)
    accepted = move(client, headers, created["bookingId"], "accepted").json()
    assert accepted["cashToCollectPence"] == 8000
    job = move(client, headers, created["bookingId"], "complete").json()
    assert job["paymentStatus"] == "deposit_paid"
    assert (job["amountPaidPence"], job["platformFeePence"], job["driverNetPence"]) == (2000, 2000, 8000)
    assert stripe_fake.of("capture") == [("capture", pid, 2000)]
    # The driver took the rest in cash, so nothing is owed either way.
    assert ledger(session_factory, driver_id) == []
    assert not stripe_fake.of("transfer")
    summary = client.get("/api/admin/payments", headers=admin_headers).json()
    assert (summary["cardTaken30DaysPence"], summary["platformFees30DaysPence"]) == (2000, 2000)


def test_cancelling_a_cash_job_lets_go_of_the_deposit(client, stripe_fake):
    created = book(client, method="cash", price=100)
    pid = hold_card(client, stripe_fake, created["trackToken"])
    assert client.post(f"/api/track/{created['trackToken']}/cancel").status_code == 200
    assert stripe_fake.of("cancel") == [("cancel", pid)]
    assert not stripe_fake.of("capture")


def test_switching_between_card_and_cash_changes_what_goes_on_the_card(client, stripe_fake):
    created = book(client, price=100)
    token = created["trackToken"]
    full = hold_card(client, stripe_fake, token)
    assert client.post(f"/api/track/{token}/payment-method", json={"method": "cash"}).status_code == 204
    assert stripe_fake.of("cancel") == [("cancel", full)], "the full-price hold is let go"
    info = track(client, token)
    assert (info["paymentMethod"], info["paymentStatus"], info["depositPence"]) == ("cash", "requires_payment", 2000)
    assert client.post(f"/api/track/{token}/payment").json()["amountPence"] == 2000

    assert client.post(f"/api/track/{token}/payment-method", json={"method": "card"}).status_code == 204
    info = track(client, token)
    assert (info["paymentMethod"], info["depositPence"], info["cashToCollectPence"]) == ("card", None, None)
    assert client.post(f"/api/track/{token}/payment").json()["amountPence"] == 10000


def test_a_refunded_deposit_takes_nothing_back_from_the_driver(client, stripe_fake, driver_login, session_factory, admin_headers):
    created = book(client, method="cash", price=100)
    pid = hold_card(client, stripe_fake, created["trackToken"])
    headers, driver_id = driver_login()
    move(client, headers, created["bookingId"], "accepted", "complete")
    refunded = client.post(f"/api/admin/bookings/{created['bookingId']}/refund", json={"amountPence": None}, headers=admin_headers)
    assert refunded.status_code == 200, refunded.text
    assert refunded.json()["paymentStatus"] == "refunded"
    assert stripe_fake.of("refund") == [("refund", pid, 2000)]
    assert ledger(session_factory, driver_id) == []


def test_the_cut_on_a_cash_job_comes_off_the_next_card_job(client, stripe_fake, driver_login, session_factory, admin_headers):
    headers, driver_id = driver_login()
    connect(session_factory, driver_id)

    # The customer never paid the deposit, so the driver collects the full
    # price and owes the platform its cut.
    cash = book(client, method="cash", price=50)
    assert move(client, headers, cash["bookingId"], "accepted").json()["cashToCollectPence"] == 5000
    move(client, headers, cash["bookingId"], "complete")
    assert ledger(session_factory, driver_id) == [("cash_commission", -1000)]
    assert client.get("/api/me/earnings", headers=headers).json()["balancePence"] == -1000
    summary = client.get("/api/admin/payments", headers=admin_headers).json()
    assert summary["owedByDriversPence"] == 1000

    card = book(client, price=100)
    pid = hold_card(client, stripe_fake, card["trackToken"])
    move(client, headers, card["bookingId"], "accepted", "complete")
    assert stripe_fake.of("transfer") == [("transfer", 7000, "acct_driver", f"ch_{pid}")]
    assert client.get("/api/me/earnings", headers=headers).json()["balancePence"] == 0


def test_cancelling_lets_go_of_the_hold(client, stripe_fake):
    created = book(client, price=90)
    pid = hold_card(client, stripe_fake, created["trackToken"])
    assert client.post(f"/api/track/{created['trackToken']}/cancel").status_code == 200
    assert stripe_fake.of("cancel") == [("cancel", pid)]
    assert track(client, created["trackToken"])["paymentStatus"] == "cancelled"


def test_an_unpaid_card_job_is_only_closed_once_the_driver_took_payment(client, stripe_fake, driver_login, session_factory):
    created = book(client, price=100)
    headers, driver_id = driver_login()
    move(client, headers, created["bookingId"], "accepted")
    refused = move(client, headers, created["bookingId"], "complete")
    assert refused.status_code == 409
    assert "paid in person" in refused.json()["detail"]

    closed = move(client, headers, created["bookingId"], "complete", paid_in_person=True)
    assert closed.status_code == 200, closed.text
    assert (closed.json()["paymentMethod"], closed.json()["paymentStatus"]) == ("cash", "paid_in_person")
    assert ledger(session_factory, driver_id) == [("cash_commission", -2000)]


def test_a_card_booked_days_ahead_is_charged_from_the_saved_card(client, stripe_fake, driver_login, session_factory):
    created = book(client, price=100)
    pid = hold_card(client, stripe_fake, created["trackToken"])
    stripe_fake.intents[pid]["status"] = "canceled"  # the seven-day hold ran out
    headers, driver_id = driver_login()
    done = move(client, headers, created["bookingId"], "accepted", "complete")
    assert done.json()["paymentStatus"] == "paid"
    assert [c[2] for c in stripe_fake.of("saved_card")] == [10000]


def test_instant_cash_out_passes_on_stripes_fee(client, stripe_fake, driver_login, session_factory):
    headers, driver_id = driver_login()
    assert client.post("/api/me/earnings/payout", json={"instant": True}, headers=headers).status_code == 409
    connect(session_factory, driver_id)
    stripe_fake.balance_value = {"available": 12000, "pending": 0, "instant_available": 12000}

    instant = client.post("/api/me/earnings/payout", json={"instant": True}, headers=headers)
    assert instant.status_code == 200, instant.text
    assert (instant.json()["amountPence"], instant.json()["feePence"]) == (12000, 120)
    assert ledger(session_factory, driver_id) == [("instant_fee", -120)]

    standard = client.post("/api/me/earnings/payout", json={"instant": False}, headers=headers).json()
    assert standard["feePence"] == 0
    assert [c[3] for c in stripe_fake.of("payout")] == [True, False]


def test_a_refund_takes_back_the_drivers_share(client, stripe_fake, driver_login, session_factory, admin_headers):
    created = book(client, price=100)
    pid = hold_card(client, stripe_fake, created["trackToken"])
    headers, driver_id = driver_login()
    connect(session_factory, driver_id)
    move(client, headers, created["bookingId"], "accepted", "complete")

    too_much = client.post(f"/api/admin/bookings/{created['bookingId']}/refund", json={"amountPence": 20000}, headers=admin_headers)
    assert too_much.status_code == 422
    refunded = client.post(f"/api/admin/bookings/{created['bookingId']}/refund", json={"amountPence": 5000}, headers=admin_headers)
    assert refunded.status_code == 200, refunded.text
    assert refunded.json()["paymentStatus"] == "partly_refunded"
    assert stripe_fake.of("refund") == [("refund", pid, 5000)]
    assert ledger(session_factory, driver_id)[-1] == ("refund", -4000)


def test_the_office_can_record_commission_a_driver_paid_directly(client, stripe_fake, driver_login, session_factory, admin_headers):
    headers, driver_id = driver_login()
    cash = book(client, method="cash", price=50)
    move(client, headers, cash["bookingId"], "accepted", "complete")
    settled = client.post(
        f"/api/admin/drivers/{driver_id}/ledger",
        json={"kind": "settlement", "amountPence": 1000, "note": "Paid by bank transfer"},
        headers=admin_headers,
    )
    assert settled.status_code == 200, settled.text
    assert settled.json()["balancePence"] == 0


def test_payment_pages_need_the_right_sign_in(client, stripe_fake):
    assert client.get("/api/me/earnings").status_code == 401
    assert client.get("/api/admin/payments").status_code == 401
    assert client.post("/api/admin/payments/pay-drivers").status_code == 401
