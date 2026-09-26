"""Payment endpoints: the customer's card, drivers' earnings and payouts, the
office's view of the money, and Stripe's webhook. The rules live in payments.py."""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from . import audit, models, payments, schemas
from .auth import require_admin
from .config import settings
from .db import get_db
from .drivers import DriverContext, current_driver
from .serialize import booking_out, driver_names
from .stripe_gateway import PaymentError
from .timeutil import iso, now

router = APIRouter()


def _site(request: Request) -> str:
    """Where to send a driver back to: the page that asked, if it's one of ours."""
    origin = request.headers.get("origin") or ""
    return origin if origin in settings.cors_origin_list else settings.site_url.rstrip("/")


def _booking_by_token(db: Session, token: str) -> models.Booking:
    booking = db.scalars(select(models.Booking).where(models.Booking.track_token == token)).first()
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


# ── Public ──────────────────────────────────────────────────────────────────


@router.get("/api/payments/config", response_model=schemas.PaymentsConfigOut)
def payments_config() -> schemas.PaymentsConfigOut:
    on = payments.enabled()
    return schemas.PaymentsConfigOut(
        enabled=on,
        publishableKey=settings.stripe_publishable_key if on else None,
        feePercent=settings.platform_fee_percent,
    )


@router.post("/api/track/{token}/payment", response_model=schemas.CardPaymentOut)
def start_card_payment(token: str, db: Session = Depends(get_db)) -> schemas.CardPaymentOut:
    """The customer's card form: a client secret for holding the price, or a cash job's deposit."""
    booking = _booking_by_token(db, token)
    result = payments.start_card_payment(db, booking)
    db.commit()
    return schemas.CardPaymentOut(publishableKey=settings.stripe_publishable_key, **result)


@router.post("/api/track/{token}/payment/sync", response_model=schemas.CardPaymentOut)
def sync_card_payment(token: str, db: Session = Depends(get_db)) -> schemas.CardPaymentOut:
    """Called straight after the customer confirms, so the page doesn't wait on the webhook."""
    booking = _booking_by_token(db, token)
    payments.sync_payment(db, booking)
    db.commit()
    return schemas.CardPaymentOut(
        clientSecret=None,
        publishableKey=settings.stripe_publishable_key,
        amountPence=payments.online_amount(booking) or 0,
        status=booking.payment_status,
    )


@router.post("/api/track/{token}/payment-method", status_code=204)
def choose_payment_method(
    token: str, payload: schemas.PaymentMethodIn, db: Session = Depends(get_db)
) -> None:
    booking = _booking_by_token(db, token)
    payments.choose_method(db, booking, payload.method)
    db.commit()


@router.post("/api/payments/webhook", status_code=204)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)) -> None:
    """Stripe telling us a payment was held, taken or refused, or a driver's account changed.

    Two Stripe webhook endpoints point here: one for the platform's own events
    (STRIPE_WEBHOOK_SECRET) and one for connected accounts' events
    (STRIPE_CONNECT_WEBHOOK_SECRET). Each signs with its own secret, so an
    event is accepted if it verifies against either.
    """
    signing_secrets = [
        s for s in (settings.stripe_webhook_secret, settings.stripe_connect_webhook_secret) if s
    ]
    if not signing_secrets:
        raise HTTPException(status_code=503, detail="Webhooks are not set up.")
    body = await request.body()
    signature = request.headers.get("stripe-signature", "")
    event = None
    for secret in signing_secrets:
        try:
            event = payments.gateway().construct_event(body, signature, secret)
            break
        except PaymentError:
            continue
    if event is None:
        raise HTTPException(status_code=400, detail="That webhook couldn't be verified.")
    await run_in_threadpool(_handle_event, db, event)


def _handle_event(db: Session, event: dict) -> None:
    payments.handle_event(db, event)
    db.commit()


# ── Drivers ─────────────────────────────────────────────────────────────────


def _earnings(db: Session, driver: models.Driver) -> schemas.EarningsOut:
    E = models.DriverLedgerEntry
    since = now() - timedelta(days=30)

    def total(kind: str) -> int:
        return int(
            db.scalar(
                select(func.coalesce(func.sum(E.amount_pence), 0)).where(
                    E.driver_id == driver.id, E.kind == kind, E.created_at >= since
                )
            )
            or 0
        )

    stripe_balance = None
    if payments.enabled() and driver.stripe_account_id and driver.stripe_payouts_enabled:
        try:
            raw = payments.gateway().balance(driver.stripe_account_id)
            stripe_balance = schemas.StripeBalanceOut(
                availablePence=raw["available"],
                pendingPence=raw["pending"],
                instantAvailablePence=raw["instant_available"],
            )
        except PaymentError:
            stripe_balance = None

    rows = db.scalars(select(E).where(E.driver_id == driver.id).order_by(E.id.desc()).limit(60)).all()
    return schemas.EarningsOut(
        enabled=payments.enabled(),
        feePercent=settings.platform_fee_percent,
        account=schemas.PayoutAccountOut(
            connected=bool(driver.stripe_account_id),
            detailsSubmitted=driver.stripe_details_submitted,
            payoutsEnabled=driver.stripe_payouts_enabled,
        ),
        balancePence=payments.ledger_balance(db, driver.id),
        stripeBalance=stripe_balance,
        earned30DaysPence=total("card_earning"),
        commission30DaysPence=-total("cash_commission"),
        transferred30DaysPence=-total("transfer"),
        entries=[
            schemas.LedgerEntryOut(
                id=e.id,
                kind=e.kind,
                amountPence=e.amount_pence,
                bookingId=e.booking_id,
                note=e.note,
                createdAt=iso(e.created_at) or "",
            )
            for e in rows
        ],
    )


@router.get("/api/me/earnings", response_model=schemas.EarningsOut)
def my_earnings(ctx: DriverContext = Depends(current_driver), db: Session = Depends(get_db)):
    return _earnings(db, ctx.driver)


@router.post("/api/me/earnings/refresh", response_model=schemas.EarningsOut)
def refresh_my_earnings(ctx: DriverContext = Depends(current_driver), db: Session = Depends(get_db)):
    """After coming back from Stripe's setup pages."""
    payments.refresh_account(db, ctx.driver)
    db.commit()
    return _earnings(db, ctx.driver)


@router.post("/api/me/earnings/onboarding", response_model=schemas.LinkOut)
def start_payout_setup(
    request: Request, ctx: DriverContext = Depends(current_driver), db: Session = Depends(get_db)
):
    """Stripe's own pages for a driver's ID and bank details. Nothing sensitive touches this site."""
    account = payments.ensure_account(db, ctx.driver, ctx.user.email)
    audit.record(db, ctx.user, "payment.setup_started", target_type="driver", target_id=ctx.driver.id)
    db.commit()
    site = _site(request)
    try:
        url = payments.gateway().onboarding_link(
            account=account,
            refresh_url=f"{site}/driver/earnings?setup=retry",
            return_url=f"{site}/driver/earnings?setup=done",
        )
    except PaymentError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't open payout setup. {exc}") from exc
    return schemas.LinkOut(url=url)


@router.post("/api/me/earnings/dashboard", response_model=schemas.LinkOut)
def open_payout_dashboard(ctx: DriverContext = Depends(current_driver), db: Session = Depends(get_db)):
    payments.require_enabled()
    if not ctx.driver.stripe_account_id or not ctx.driver.stripe_details_submitted:
        raise HTTPException(status_code=409, detail="Finish setting up payouts first.")
    try:
        return schemas.LinkOut(url=payments.gateway().dashboard_link(ctx.driver.stripe_account_id))
    except PaymentError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't open your Stripe dashboard. {exc}") from exc


@router.post("/api/me/earnings/payout", response_model=schemas.PayoutOut)
def cash_out(
    payload: schemas.PayoutIn,
    ctx: DriverContext = Depends(current_driver),
    db: Session = Depends(get_db),
):
    result = payments.cash_out(db, ctx.driver, instant=payload.instant, actor=ctx.user)
    db.commit()
    return schemas.PayoutOut(**result)


# ── The office ──────────────────────────────────────────────────────────────


class PayDriversOut(BaseModel):
    drivers: int
    transferredPence: int


@router.get("/api/admin/payments", response_model=schemas.PaymentsSummaryOut)
def payments_summary(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    B = models.Booking
    E = models.DriverLedgerEntry
    since = now() - timedelta(days=30)

    def sum_of(column, *where) -> int:
        return int(db.scalar(select(func.coalesce(func.sum(column), 0)).where(B.paid_at >= since, *where)) or 0)

    # Everything taken by card through the site: full payments and cash-job deposits.
    taken = ("paid", "deposit_paid", "refunded", "partly_refunded")
    card_taken = sum_of(B.amount_paid_pence, B.payment_status.in_(taken))
    fees = sum_of(B.platform_fee_pence, B.payment_status.in_((*taken, "paid_in_person")))
    refunded = sum_of(B.refunded_pence)

    balances = dict(db.execute(select(E.driver_id, func.sum(E.amount_pence)).group_by(E.driver_id)).all())
    drivers = db.scalars(
        select(models.Driver).where(
            (models.Driver.active & (models.Driver.application_status == "active"))
            | models.Driver.id.in_(list(balances.keys()) or [-1])
        ).order_by(models.Driver.name)
    ).all()
    names = driver_names(db)
    recent = db.scalars(
        select(B)
        .where((B.payment_status != "none") | (B.payment_method == "card"))
        .order_by(B.created_at.desc())
        .limit(50)
    ).all()

    return schemas.PaymentsSummaryOut(
        enabled=payments.enabled(),
        feePercent=settings.platform_fee_percent,
        cardTaken30DaysPence=card_taken,
        platformFees30DaysPence=fees,
        refunded30DaysPence=refunded,
        owedToDriversPence=sum(v for v in balances.values() if v and v > 0),
        owedByDriversPence=-sum(v for v in balances.values() if v and v < 0),
        drivers=[
            schemas.DriverBalanceOut(
                driverId=d.id,
                name=d.name,
                connected=bool(d.stripe_account_id),
                payoutsEnabled=d.stripe_payouts_enabled,
                balancePence=int(balances.get(d.id) or 0),
            )
            for d in drivers
        ],
        recent=[
            schemas.PaymentRowOut(
                bookingId=b.id,
                createdAt=iso(b.created_at) or "",
                service=b.service,
                price=b.price,
                status=b.status,
                paymentMethod=b.payment_method,
                paymentStatus=b.payment_status,
                amountPaidPence=b.amount_paid_pence,
                platformFeePence=b.platform_fee_pence,
                driverNetPence=b.driver_net_pence,
                refundedPence=b.refunded_pence or 0,
                driverName=names.get(b.driver_id) if b.driver_id is not None else None,
                depositPence=b.deposit_pence,
            )
            for b in recent
        ],
    )


@router.post("/api/admin/bookings/{booking_id}/refund", response_model=schemas.BookingOut)
def refund_booking(
    booking_id: int,
    payload: schemas.RefundIn,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    booking = db.get(models.Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    payments.refund(db, booking, payload.amountPence, admin)
    db.commit()
    db.refresh(booking)
    return booking_out(booking, driver_names(db))


@router.post("/api/admin/drivers/{driver_id}/ledger", response_model=schemas.DriverBalanceOut)
def adjust_driver_balance(
    driver_id: int,
    payload: schemas.LedgerAdjustmentIn,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Record commission a driver paid the office directly, or correct a mistake."""
    driver = db.get(models.Driver, driver_id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    if payload.amountPence == 0 or (payload.kind == "settlement" and payload.amountPence < 0):
        raise HTTPException(status_code=422, detail="A settlement is money the driver paid in, so it must be more than £0.")
    payments.add_entry(db, driver.id, payload.kind, payload.amountPence, note=payload.note.strip(), actor=admin)
    audit.record(
        db, admin, f"payment.{payload.kind}", target_type="driver", target_id=driver.id,
        detail={"amountPence": payload.amountPence, "note": payload.note.strip()[:200]},
    )
    payments.pay_driver(db, driver)
    db.commit()
    return schemas.DriverBalanceOut(
        driverId=driver.id,
        name=driver.name,
        connected=bool(driver.stripe_account_id),
        payoutsEnabled=driver.stripe_payouts_enabled,
        balancePence=payments.ledger_balance(db, driver.id),
    )


@router.post("/api/admin/payments/pay-drivers", response_model=PayDriversOut)
def pay_all_drivers(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """Send every connected driver what they're owed, e.g. after a transfer failed for lack of funds."""
    payments.require_enabled()
    paid = 0
    total = 0
    for driver in db.scalars(
        select(models.Driver).where(models.Driver.stripe_payouts_enabled.is_(True))
    ).all():
        sent = payments.pay_driver(db, driver)
        if sent:
            paid += 1
            total += sent
    audit.record(db, admin, "payment.pay_drivers", detail={"drivers": paid, "amountPence": total})
    db.commit()
    return PayDriversOut(drivers=paid, transferredPence=total)
