"""The only place that talks to Stripe.

Everything else asks this for money movements and gets plain dicts back, so
the rules in payments.py can be tested against a fake with no network and no
Stripe account.
"""

from __future__ import annotations

from datetime import datetime, timezone

import stripe

try:
    from stripe import SignatureVerificationError, StripeError
except ImportError:  # older layouts of the library
    from stripe.error import SignatureVerificationError, StripeError  # type: ignore

# Towing services, the card-scheme category for vehicle recovery.
TOWING_MCC = "7549"


class PaymentError(Exception):
    """Stripe refused or failed. The message is fit to show the office or a driver."""


def _plain(obj) -> dict:
    if hasattr(obj, "to_dict_recursive"):
        return obj.to_dict_recursive()
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    return dict(obj)


class StripeGateway:
    def __init__(self, secret_key: str):
        self._key = secret_key

    def _call(self, fn, *args, **kwargs) -> dict:
        try:
            result = fn(*args, api_key=self._key, **kwargs)
        except StripeError as exc:
            message = getattr(exc, "user_message", None) or str(exc) or "Stripe didn't accept that."
            raise PaymentError(message) from exc
        return _plain(result)

    # ── Customers ───────────────────────────────────────────────────────────

    def create_customer(self, *, metadata: dict, idempotency_key: str) -> str:
        return self._call(stripe.Customer.create, metadata=metadata, idempotency_key=idempotency_key)["id"]

    def create_payment_intent(
        self,
        *,
        amount: int,
        customer: str,
        capture_manually: bool,
        save_card: bool,
        description: str,
        metadata: dict,
        idempotency_key: str,
    ) -> dict:
        params: dict = {
            "amount": amount,
            "currency": "gbp",
            "customer": customer,
            "description": description,
            "metadata": metadata,
            # Cards, Apple Pay and Google Pay: methods that can be held, and
            # never a redirect away from someone stood at the roadside.
            "automatic_payment_methods": {"enabled": True, "allow_redirects": "never"},
        }
        if capture_manually:
            params["capture_method"] = "manual"
        if save_card:
            params["setup_future_usage"] = "off_session"
        return self._call(stripe.PaymentIntent.create, idempotency_key=idempotency_key, **params)

    def retrieve_payment_intent(self, intent_id: str) -> dict:
        return self._call(stripe.PaymentIntent.retrieve, intent_id)

    def capture_payment_intent(self, intent_id: str, *, amount: int | None = None) -> dict:
        params = {"amount_to_capture": amount} if amount else {}
        return self._call(
            stripe.PaymentIntent.capture, intent_id, idempotency_key=f"capture-{intent_id}", **params
        )

    def cancel_payment_intent(self, intent_id: str) -> dict:
        return self._call(stripe.PaymentIntent.cancel, intent_id)

    def charge_saved_card(
        self,
        *,
        amount: int,
        customer: str,
        payment_method: str,
        description: str,
        metadata: dict,
        idempotency_key: str,
    ) -> dict:
        return self._call(
            stripe.PaymentIntent.create,
            idempotency_key=idempotency_key,
            amount=amount,
            currency="gbp",
            customer=customer,
            payment_method=payment_method,
            off_session=True,
            confirm=True,
            description=description,
            metadata=metadata,
        )

    def create_refund(self, *, payment_intent: str, amount: int, idempotency_key: str) -> str:
        return self._call(
            stripe.Refund.create, idempotency_key=idempotency_key, payment_intent=payment_intent, amount=amount
        )["id"]

    # ── Drivers ─────────────────────────────────────────────────────────────

    def create_express_account(self, *, email: str | None, metadata: dict, idempotency_key: str) -> str:
        params: dict = {
            "type": "express",
            "country": "GB",
            "business_type": "individual",
            "capabilities": {"transfers": {"requested": True}},
            "business_profile": {
                "mcc": TOWING_MCC,
                "product_description": "Vehicle recovery and roadside assistance booked through Car Recovery Near Me",
            },
            # Money waits in their balance until they choose to cash out.
            "settings": {"payouts": {"schedule": {"interval": "manual"}}},
            "metadata": metadata,
        }
        if email:
            params["email"] = email
        return self._call(stripe.Account.create, idempotency_key=idempotency_key, **params)["id"]

    def onboarding_link(self, *, account: str, refresh_url: str, return_url: str) -> str:
        return self._call(
            stripe.AccountLink.create,
            account=account,
            refresh_url=refresh_url,
            return_url=return_url,
            type="account_onboarding",
        )["url"]

    def dashboard_link(self, account: str) -> str:
        return self._call(stripe.Account.create_login_link, account)["url"]

    def retrieve_account(self, account: str) -> dict:
        return self._call(stripe.Account.retrieve, account)

    def create_transfer(
        self,
        *,
        amount: int,
        destination: str,
        source_transaction: str | None,
        metadata: dict,
        idempotency_key: str,
    ) -> str:
        params: dict = {"amount": amount, "currency": "gbp", "destination": destination, "metadata": metadata}
        if source_transaction:
            params["source_transaction"] = source_transaction
        return self._call(stripe.Transfer.create, idempotency_key=idempotency_key, **params)["id"]

    def balance(self, account: str) -> dict:
        raw = self._call(stripe.Balance.retrieve, stripe_account=account)

        def gbp(rows) -> int:
            return sum(int(r.get("amount", 0)) for r in (rows or []) if r.get("currency") == "gbp")

        return {
            "available": gbp(raw.get("available")),
            "pending": gbp(raw.get("pending")),
            "instant_available": gbp(raw.get("instant_available")),
        }

    def create_payout(self, *, account: str, amount: int, instant: bool, idempotency_key: str) -> dict:
        payout = self._call(
            stripe.Payout.create,
            stripe_account=account,
            idempotency_key=idempotency_key,
            amount=amount,
            currency="gbp",
            method="instant" if instant else "standard",
        )
        arrival = payout.get("arrival_date")
        return {
            "id": payout["id"],
            "arrival_date": datetime.fromtimestamp(arrival, tz=timezone.utc).date().isoformat() if arrival else None,
        }

    # ── Webhooks ────────────────────────────────────────────────────────────

    def construct_event(self, payload: bytes, signature: str, secret: str) -> dict:
        try:
            event = stripe.Webhook.construct_event(payload, signature, secret)
        except (ValueError, SignatureVerificationError) as exc:
            raise PaymentError("That webhook couldn't be verified.") from exc
        return _plain(event)
