"""Taking payment, keeping the platform's cut, and paying drivers.

Card jobs. The customer's card is held when they book: a manual-capture
PaymentIntent on the platform's own Stripe account, with the card saved in
case the hold runs out before a job booked days ahead. When the driver marks
the job done the payment is taken, the platform keeps its percentage, and the
driver's share is moved to their Stripe Express account with a transfer.
Charges and transfers are separate because nobody knows which driver will take
a job at the moment it is booked.

Cash jobs. The customer pays the platform's cut as a deposit on their card,
held at booking and taken when the job is done, and pays the rest in cash to
the driver. Nothing is then owed either way. If no deposit was ever held (card
payments switched off, or the customer never added a card) the driver collects
the full price, and the platform's cut is written to the driver's ledger and
comes off their next card earnings, or is settled with the office.

Payouts. Money sits in the driver's Stripe balance until they cash out: a
standard payout (no charge, a few working days) or an instant one (Stripe's
1%, minimum 50p, recovered through the ledger).

Every movement between the platform and a driver is a ledger row, so a
driver's balance is the sum of their rows: positive is owed to them, negative
is owed by them. Stripe failures never stop a job being marked done; they
leave the payment marked failed for the office to see.
"""

from __future__ import annotations

import math

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import audit, models
from .config import settings
from .stripe_gateway import PaymentError, StripeGateway
from .timeutil import now

INSTANT_FEE_RATE = 0.01
INSTANT_FEE_MIN_PENCE = 50

# A customer may start (or retry) paying by card from these.
CARD_RETRYABLE = {"none", "requires_payment", "failed", "cancelled"}
# Money has already been dealt with.
SETTLED = {"paid", "deposit_paid", "paid_in_person", "refunded", "partly_refunded"}
# Taken by card through the site, so it can be refunded here.
TAKEN_ONLINE = {"paid", "deposit_paid", "partly_refunded"}

_gateway: StripeGateway | None = None


def enabled() -> bool:
    return settings.payments_enabled


def gateway() -> StripeGateway:
    global _gateway
    if _gateway is None:
        _gateway = StripeGateway(settings.stripe_secret_key)
    return _gateway


def set_gateway(value: StripeGateway | None) -> None:
    """Swap the Stripe client, for tests."""
    global _gateway
    _gateway = value


def require_enabled() -> None:
    if not enabled():
        raise HTTPException(status_code=503, detail="Card payments are not switched on.")


def pence(pounds: int | None) -> int | None:
    return None if pounds is None else int(pounds) * 100


def split(amount_pence: int) -> tuple[int, int]:
    """(platform fee, driver's share) of an amount."""
    fee = round(amount_pence * settings.platform_fee_percent / 100)
    return fee, amount_pence - fee


def instant_fee(amount_pence: int) -> int:
    return max(INSTANT_FEE_MIN_PENCE, math.ceil(amount_pence * INSTANT_FEE_RATE))


def deposit_for(price_pounds: int | None) -> int | None:
    """The deposit a cash job asks for: the platform's cut of the price."""
    amount = pence(price_pounds)
    return None if not amount else split(amount)[0]


def takes_deposit(booking: models.Booking) -> bool:
    return booking.payment_method == "cash" and bool(booking.deposit_pence)


def online_amount(booking: models.Booking) -> int | None:
    """What the customer pays through the site: the price by card, or the deposit on a cash job."""
    if booking.payment_method == "card":
        return pence(booking.price)
    return booking.deposit_pence if takes_deposit(booking) else None


def cash_to_collect(booking: models.Booking) -> int | None:
    """What the driver collects in cash on the day, in pence. None on a card job."""
    price = pence(booking.price)
    if booking.payment_method != "cash" or price is None:
        return None
    if takes_deposit(booking) and booking.payment_status in ("authorised", "deposit_paid"):
        return max(0, price - int(booking.deposit_pence or 0))
    return price


# ── The ledger ──────────────────────────────────────────────────────────────


def ledger_balance(db: Session, driver_id: int) -> int:
    E = models.DriverLedgerEntry
    return int(db.scalar(select(func.coalesce(func.sum(E.amount_pence), 0)).where(E.driver_id == driver_id)) or 0)


def add_entry(
    db: Session,
    driver_id: int,
    kind: str,
    amount_pence: int,
    *,
    booking_id: int | None = None,
    note: str | None = None,
    actor: models.User | None = None,
    transfer_id: str | None = None,
    payout_id: str | None = None,
) -> models.DriverLedgerEntry:
    entry = models.DriverLedgerEntry(
        driver_id=driver_id,
        booking_id=booking_id,
        kind=kind,
        amount_pence=amount_pence,
        note=note,
        created_by_user_id=actor.id if actor else None,
        stripe_transfer_id=transfer_id,
        stripe_payout_id=payout_id,
    )
    db.add(entry)
    db.flush()
    return entry


def pay_driver(
    db: Session,
    driver: models.Driver,
    *,
    source_charge: str | None = None,
    source_amount: int | None = None,
) -> int:
    """Move whatever the platform owes a driver into their Stripe account.

    Tied to the charge that earned it where possible, so Stripe sends the
    transfer as soon as that customer's money arrives rather than needing it
    already sitting in the platform's balance. Returns the pence transferred.
    """
    if not enabled() or not driver.stripe_account_id or not driver.stripe_payouts_enabled:
        return 0
    balance = ledger_balance(db, driver.id)
    if balance <= 0:
        return 0
    E = models.DriverLedgerEntry
    last_id = db.scalar(select(func.max(E.id)).where(E.driver_id == driver.id)) or 0
    tie_to_charge = source_charge is not None and source_amount is not None and balance <= source_amount
    try:
        transfer_id = gateway().create_transfer(
            amount=balance,
            destination=driver.stripe_account_id,
            source_transaction=source_charge if tie_to_charge else None,
            metadata={"driver_id": str(driver.id)},
            idempotency_key=f"driver-{driver.id}-ledger-{last_id}",
        )
    except PaymentError as exc:
        audit.record(
            db, None, "payment.transfer_failed", target_type="driver", target_id=driver.id,
            detail={"amountPence": balance, "reason": str(exc)[:200]},
        )
        return 0
    add_entry(db, driver.id, "transfer", -balance, transfer_id=transfer_id)
    audit.record(
        db, None, "payment.transferred", target_type="driver", target_id=driver.id,
        detail={"amountPence": balance},
    )
    return balance


# ── Customers paying ────────────────────────────────────────────────────────


def card_available(booking: models.Booking) -> bool:
    return enabled() and booking.price is not None and booking.status != "cancelled"


def set_method(booking: models.Booking, method: str) -> None:
    """Set how a new or not-yet-paid booking pays, and what is due through the site."""
    online = card_available(booking)
    if method == "card" and online:
        booking.payment_method = "card"
        booking.deposit_pence = None
        booking.payment_status = "requires_payment"
        return
    booking.payment_method = "cash"
    booking.deposit_pence = deposit_for(booking.price) if online else None
    booking.payment_status = "requires_payment" if booking.deposit_pence else "none"


def choose_method(db: Session, booking: models.Booking, method: str) -> None:
    """Switch between paying by card and paying cash with a deposit, before anything is taken."""
    if booking.payment_status in SETTLED or booking.status in ("complete", "cancelled"):
        raise HTTPException(status_code=409, detail="This booking has already been paid or closed.")
    if method == booking.payment_method:
        return
    if method == "card" and not card_available(booking):
        raise HTTPException(status_code=409, detail="Card payment isn't available for this booking.")
    # Let go of any hold for the old amount first: the full price and the
    # deposit are different amounts, so each gets its own payment.
    release_card(db, booking)
    set_method(booking, method)


def start_card_payment(db: Session, booking: models.Booking) -> dict:
    """What the browser needs to show the card form: a client secret for the price, or the deposit."""
    require_enabled()
    if booking.price is None:
        raise HTTPException(status_code=409, detail="This booking doesn't have a price yet.")
    if booking.status == "cancelled":
        raise HTTPException(status_code=409, detail="This booking was cancelled.")
    amount = online_amount(booking)
    if amount is None:
        raise HTTPException(status_code=409, detail="This booking is paid in cash to the driver.")
    deposit = booking.payment_method == "cash"
    if booking.payment_status in ("authorised", *SETTLED):
        return {"clientSecret": None, "amountPence": amount, "status": booking.payment_status}

    g = gateway()
    try:
        if booking.stripe_payment_intent_id:
            intent = g.retrieve_payment_intent(booking.stripe_payment_intent_id)
            if intent["status"] in ("requires_capture", "succeeded"):
                apply_intent(db, booking, intent)
                return {"clientSecret": None, "amountPence": amount, "status": booking.payment_status}
            if (
                intent["status"] in ("requires_payment_method", "requires_confirmation", "requires_action")
                and intent["amount"] == amount
            ):
                booking.payment_status = "requires_payment"
                return {"clientSecret": intent["client_secret"], "amountPence": amount, "status": "requires_payment"}

        if not booking.stripe_customer_id:
            booking.stripe_customer_id = g.create_customer(
                metadata={"booking_id": str(booking.id)},
                idempotency_key=f"booking-{booking.id}-customer",
            )
        # A job already done is paid there and then. Anything still to happen
        # is held, and the card saved in case the hold runs out first.
        finished = booking.status == "complete"
        intent = g.create_payment_intent(
            amount=amount,
            customer=booking.stripe_customer_id,
            capture_manually=not finished,
            save_card=not finished,
            description=(
                f"Deposit for car recovery booking #{booking.id}"
                if deposit
                else f"Car recovery booking #{booking.id}"
            ),
            metadata={"booking_id": str(booking.id), "kind": "deposit" if deposit else "full"},
            idempotency_key=(
                f"booking-{booking.id}-{'deposit' if deposit else 'intent'}"
                f"-{booking.stripe_payment_intent_id or 'first'}-{amount}"
            ),
        )
    except PaymentError as exc:
        raise HTTPException(status_code=502, detail=f"Card payments are unavailable right now. {exc}") from exc
    booking.stripe_payment_intent_id = intent["id"]
    booking.payment_status = "requires_payment"
    return {"clientSecret": intent["client_secret"], "amountPence": amount, "status": "requires_payment"}


def apply_intent(db: Session, booking: models.Booking, intent: dict) -> None:
    """Bring a booking into line with what Stripe says about its payment."""
    status = intent.get("status")
    if intent.get("payment_method"):
        booking.stripe_payment_method_id = intent["payment_method"]
    if status == "requires_capture":
        if booking.payment_status not in SETTLED:
            booking.payment_status = "authorised"
    elif status == "succeeded":
        if booking.payment_status not in SETTLED:
            received = int(intent.get("amount_received") or intent.get("amount") or 0)
            if booking.payment_method == "cash":
                record_deposit_paid(db, booking, received, intent.get("latest_charge"))
            else:
                record_card_paid(db, booking, received, intent.get("latest_charge"))
    elif status == "canceled":
        if booking.payment_status in ("requires_payment", "authorised"):
            booking.payment_status = "cancelled"
    elif status == "requires_payment_method" and intent.get("last_payment_error"):
        if booking.payment_status not in SETTLED:
            booking.payment_status = "failed"


def record_card_paid(db: Session, booking: models.Booking, amount: int, charge_id: str | None) -> None:
    fee, net = split(amount)
    booking.payment_status = "paid"
    booking.amount_paid_pence = amount
    booking.platform_fee_pence = fee
    booking.driver_net_pence = net
    booking.stripe_charge_id = charge_id
    booking.paid_at = now()
    audit.record(
        db, None, "payment.taken", target_type="booking", target_id=booking.id,
        detail={"amountPence": amount, "feePence": fee},
    )
    if booking.driver_id is None:
        return
    add_entry(db, booking.driver_id, "card_earning", net, booking_id=booking.id)
    driver = db.get(models.Driver, booking.driver_id)
    if driver is not None:
        pay_driver(db, driver, source_charge=charge_id, source_amount=amount)


def record_deposit_paid(db: Session, booking: models.Booking, amount: int, charge_id: str | None) -> None:
    """A cash job's deposit went through: that is the platform's cut, and the driver took the rest in cash."""
    price = pence(booking.price) or amount
    booking.payment_status = "deposit_paid"
    booking.amount_paid_pence = amount
    booking.platform_fee_pence = amount
    booking.driver_net_pence = max(0, price - amount)
    booking.stripe_charge_id = charge_id
    booking.paid_at = now()
    audit.record(
        db, None, "payment.deposit_taken", target_type="booking", target_id=booking.id,
        detail={"amountPence": amount},
    )


def sync_payment(db: Session, booking: models.Booking) -> None:
    """Ask Stripe how the payment stands, e.g. straight after the customer confirms."""
    if not enabled() or not booking.stripe_payment_intent_id:
        return
    try:
        apply_intent(db, booking, gateway().retrieve_payment_intent(booking.stripe_payment_intent_id))
    except PaymentError:
        pass


def release_card(db: Session, booking: models.Booking) -> None:
    """Let go of a hold on the customer's card, if there is one."""
    if not booking.stripe_payment_intent_id or booking.payment_status in SETTLED:
        return
    if not enabled():
        return
    try:
        intent = gateway().retrieve_payment_intent(booking.stripe_payment_intent_id)
        if intent["status"] not in ("succeeded", "canceled"):
            gateway().cancel_payment_intent(booking.stripe_payment_intent_id)
    except PaymentError as exc:
        audit.record(
            db, None, "payment.release_failed", target_type="booking", target_id=booking.id,
            detail={"reason": str(exc)[:200]},
        )
        return
    booking.payment_status = "cancelled"


def check_can_complete(booking: models.Booking, *, paid_in_person: bool) -> None:
    """A driver can't mark a card job done while nobody has paid for it."""
    if (
        booking.payment_method == "card"
        and enabled()
        and not paid_in_person
        and booking.payment_status not in ("authorised", *SETTLED)
        and not (booking.stripe_customer_id and booking.stripe_payment_method_id)
    ):
        raise HTTPException(
            status_code=409,
            detail="No card payment has gone through for this job. Take payment from the customer, then mark it done as paid in person.",
        )


def _take_from_card(db: Session, booking: models.Booking, amount: int, actor: models.User | None) -> str:
    """Take `amount` from the card the customer gave for this booking.

    Returns "taken", "no_card" (nothing was ever held or saved) or "failed".
    """
    deposit = booking.payment_method == "cash"
    g = gateway()
    try:
        intent = g.retrieve_payment_intent(booking.stripe_payment_intent_id) if booking.stripe_payment_intent_id else None
        if intent and intent["status"] == "requires_capture":
            capture = min(amount, int(intent["amount"]))
            apply_intent(db, booking, g.capture_payment_intent(intent["id"], amount=capture))
            return "taken"
        if intent and intent["status"] == "succeeded":
            apply_intent(db, booking, intent)
            return "taken"
        if booking.stripe_customer_id and booking.stripe_payment_method_id:
            # The hold ran out (a job booked days ahead): charge the saved card.
            charged = g.charge_saved_card(
                amount=amount,
                customer=booking.stripe_customer_id,
                payment_method=booking.stripe_payment_method_id,
                description=(
                    f"Deposit for car recovery booking #{booking.id}"
                    if deposit
                    else f"Car recovery booking #{booking.id}"
                ),
                metadata={"booking_id": str(booking.id), "kind": "deposit" if deposit else "full"},
                idempotency_key=f"booking-{booking.id}-saved-card" + ("-deposit" if deposit else ""),
            )
            booking.stripe_payment_intent_id = charged["id"]
            apply_intent(db, booking, charged)
            if booking.payment_status in ("paid", "deposit_paid"):
                return "taken"
            raise PaymentError("The saved card was declined.")
        return "no_card"
    except PaymentError as exc:
        booking.payment_status = "failed"
        audit.record(
            db, actor, "payment.failed", target_type="booking", target_id=booking.id,
            detail={"reason": str(exc)[:200], "deposit": deposit},
        )
        return "failed"


def on_job_complete(
    db: Session, booking: models.Booking, *, actor: models.User | None, paid_in_person: bool = False
) -> None:
    if booking.payment_status in SETTLED:
        return
    amount = pence(booking.price)

    if booking.payment_method == "card" and enabled() and not paid_in_person and amount:
        result = _take_from_card(db, booking, amount, actor)
        if result == "no_card":
            booking.payment_status = "failed"
            audit.record(
                db, actor, "payment.failed", target_type="booking", target_id=booking.id,
                detail={"reason": "No card was added for this booking."},
            )
        return

    if takes_deposit(booking) and enabled() and booking.payment_status == "authorised":
        # The driver collected the rest in cash; the deposit is the platform's cut.
        # A deposit that fails to go through now is left for the office to chase.
        _take_from_card(db, booking, int(booking.deposit_pence or 0), actor)
        return

    # Paid on the day in full, in cash or on the driver's own card machine:
    # a card job the customer paid in person, or a cash job with no deposit held.
    if booking.stripe_payment_intent_id:
        release_card(db, booking)
    if booking.payment_method == "card":
        booking.payment_method = "cash"
    booking.payment_status = "paid_in_person"
    booking.paid_at = now()
    if amount is None or booking.driver_id is None:
        return
    fee, net = split(amount)
    booking.amount_paid_pence = amount
    booking.platform_fee_pence = fee
    booking.driver_net_pence = net
    add_entry(db, booking.driver_id, "cash_commission", -fee, booking_id=booking.id)


def on_job_cancelled(db: Session, booking: models.Booking) -> None:
    # Free to cancel: let go of the hold, whether the full price or a deposit.
    release_card(db, booking)


def refund(db: Session, booking: models.Booking, amount_pence: int | None, actor: models.User) -> None:
    """Give money back on a card payment or deposit, and take the driver's share of a card payment back through the ledger."""
    require_enabled()
    if booking.payment_status not in TAKEN_ONLINE or not booking.stripe_payment_intent_id:
        raise HTTPException(status_code=409, detail="Only a card payment taken through the site can be refunded here.")
    paid = booking.amount_paid_pence or 0
    remaining = paid - (booking.refunded_pence or 0)
    amount = remaining if amount_pence is None else amount_pence
    if amount <= 0 or amount > remaining:
        raise HTTPException(status_code=422, detail=f"You can refund up to £{remaining / 100:.2f}.")
    try:
        gateway().create_refund(
            payment_intent=booking.stripe_payment_intent_id,
            amount=amount,
            idempotency_key=f"booking-{booking.id}-refund-{booking.refunded_pence or 0}-{amount}",
        )
    except PaymentError as exc:
        raise HTTPException(status_code=409, detail=f"Stripe refused the refund. {exc}") from exc
    booking.refunded_pence = (booking.refunded_pence or 0) + amount
    booking.payment_status = "refunded" if booking.refunded_pence >= paid else "partly_refunded"
    # On a deposit the driver was paid in cash, not by us, so there is nothing to claw back.
    if booking.payment_method == "card" and booking.driver_id is not None and booking.driver_net_pence and paid:
        clawback = round(amount * booking.driver_net_pence / paid)
        if clawback:
            add_entry(
                db, booking.driver_id, "refund", -clawback, booking_id=booking.id, actor=actor,
                note=f"Share of a £{amount / 100:.2f} refund",
            )
    audit.record(
        db, actor, "payment.refunded", target_type="booking", target_id=booking.id,
        detail={"amountPence": amount},
    )


# ── Drivers getting paid ────────────────────────────────────────────────────


def ensure_account(db: Session, driver: models.Driver, email: str | None) -> str:
    require_enabled()
    if driver.stripe_account_id:
        return driver.stripe_account_id
    try:
        driver.stripe_account_id = gateway().create_express_account(
            email=email,
            metadata={"driver_id": str(driver.id)},
            idempotency_key=f"driver-{driver.id}-account",
        )
    except PaymentError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't start payout setup. {exc}") from exc
    db.flush()
    return driver.stripe_account_id


def apply_account(db: Session, driver: models.Driver, account: dict) -> None:
    was_enabled = driver.stripe_payouts_enabled
    driver.stripe_details_submitted = bool(account.get("details_submitted"))
    driver.stripe_payouts_enabled = bool(account.get("payouts_enabled"))
    if driver.stripe_payouts_enabled and not was_enabled:
        db.flush()
        pay_driver(db, driver)


def refresh_account(db: Session, driver: models.Driver) -> None:
    if not enabled() or not driver.stripe_account_id:
        return
    try:
        apply_account(db, driver, gateway().retrieve_account(driver.stripe_account_id))
    except PaymentError:
        pass


def cash_out(db: Session, driver: models.Driver, *, instant: bool, actor: models.User) -> dict:
    require_enabled()
    if not driver.stripe_account_id or not driver.stripe_payouts_enabled:
        raise HTTPException(status_code=409, detail="Finish setting up payouts first.")
    g = gateway()
    try:
        balance = g.balance(driver.stripe_account_id)
    except PaymentError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't read your balance. {exc}") from exc
    amount = balance["instant_available"] if instant else balance["available"]
    if amount <= 0:
        raise HTTPException(
            status_code=409,
            detail=(
                "Nothing is ready for an instant payout yet. A job's money is ready shortly after it's paid."
                if instant
                else "Nothing is ready to pay out yet."
            ),
        )
    fee = instant_fee(amount) if instant else 0
    if instant and amount <= fee:
        raise HTTPException(status_code=409, detail="That's less than the instant payout fee.")
    try:
        payout = g.create_payout(
            account=driver.stripe_account_id,
            amount=amount,
            instant=instant,
            idempotency_key=f"driver-{driver.id}-payout-{amount}-{int(now().timestamp()) // 60}",
        )
    except PaymentError as exc:
        raise HTTPException(status_code=409, detail=f"Stripe couldn't send that payout. {exc}") from exc
    if fee:
        add_entry(
            db, driver.id, "instant_fee", -fee, payout_id=payout["id"], actor=actor,
            note="Instant payout fee",
        )
    audit.record(
        db, actor, "payment.payout", target_type="driver", target_id=driver.id,
        detail={"amountPence": amount, "instant": instant, "feePence": fee},
    )
    return {
        "payoutId": payout["id"],
        "amountPence": amount,
        "feePence": fee,
        "instant": instant,
        "arrivalDate": payout.get("arrival_date"),
    }


# ── Webhooks ────────────────────────────────────────────────────────────────


def _booking_for_intent(db: Session, intent: dict) -> models.Booking | None:
    booking = db.scalars(
        select(models.Booking).where(models.Booking.stripe_payment_intent_id == intent.get("id"))
    ).first()
    if booking is not None:
        return booking
    booking_id = (intent.get("metadata") or {}).get("booking_id")
    if booking_id and str(booking_id).isdigit():
        found = db.get(models.Booking, int(booking_id))
        if found is not None and found.stripe_payment_intent_id in (None, intent.get("id")):
            found.stripe_payment_intent_id = intent.get("id")
            return found
    return None


def handle_event(db: Session, event: dict) -> bool:
    """Apply one verified Stripe event. Returns False if it was already handled."""
    if db.get(models.StripeEvent, event["id"]) is not None:
        return False
    db.add(models.StripeEvent(id=event["id"], type=event["type"]))
    kind = event["type"]
    obj = event["data"]["object"]

    if kind.startswith("payment_intent."):
        booking = _booking_for_intent(db, obj)
        if booking is not None:
            apply_intent(db, booking, obj)
    elif kind == "charge.refunded":
        booking = db.scalars(
            select(models.Booking).where(models.Booking.stripe_payment_intent_id == obj.get("payment_intent"))
        ).first()
        if booking is not None and booking.amount_paid_pence:
            refunded = max(booking.refunded_pence or 0, int(obj.get("amount_refunded") or 0))
            booking.refunded_pence = refunded
            booking.payment_status = "refunded" if refunded >= booking.amount_paid_pence else "partly_refunded"
    elif kind == "account.updated":
        driver = db.scalars(
            select(models.Driver).where(models.Driver.stripe_account_id == obj.get("id"))
        ).first()
        if driver is not None:
            apply_account(db, driver, obj)
    return True
