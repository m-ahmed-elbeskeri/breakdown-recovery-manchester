"""UK-first phone validation for bookings. Mirrors src/phone.ts.

A booking is useless if nobody can ring the customer back, so the API holds
every submission to the same rules the form does — a request that skips the
form cannot store 1234567 or a premium-rate 09 number either. Valid numbers
come back in one tidy shape ("07700 900123", "0161 496 0000", "+33612345678")
so the operator reads them the same way every time.
"""

import re

_ALLOWED = re.compile(r"^[\d\s()+.\-]+$")
_EMERGENCY = {"999", "112", "911"}


def _is_city_code(d: str) -> bool:
    """011x and 01x1 are the big-city codes (0113 Leeds, 0161 Manchester)."""
    return d[2] == "1" or d[3] == "1"


def _format_landline(d: str) -> str:
    if d.startswith("02"):
        return f"{d[:3]} {d[3:7]} {d[7:]}"
    if d.startswith("03"):
        return f"{d[:4]} {d[4:7]} {d[7:]}"
    if len(d) == 11 and _is_city_code(d):
        return f"{d[:4]} {d[4:7]} {d[7:]}"
    return f"{d[:5]} {d[5:]}"


def _uk(d: str) -> str:
    if not d.startswith("0"):
        raise ValueError("UK phone numbers start with 0 or +44")
    kind = d[1] if len(d) > 1 else ""
    if kind == "7":
        if len(d) != 11:
            raise ValueError("UK mobile numbers have 11 digits")
        # 070 personal numbers and 076 pagers, except 07624 Isle of Man mobiles.
        if d.startswith("070") or (d.startswith("076") and not d.startswith("07624")):
            raise ValueError("not a mobile number that can be rung back")
        return f"{d[:5]} {d[5:]}"
    if kind in {"1", "2", "3"}:
        # A few small 01 areas still have ten-digit numbers; city codes never do.
        if len(d) == 11 or (kind == "1" and len(d) == 10 and not _is_city_code(d)):
            return _format_landline(d)
        raise ValueError("UK landline numbers have 11 digits")
    if kind in {"8", "9"}:
        raise ValueError("08 and 09 numbers cannot be rung back")
    raise ValueError("not a UK mobile or landline number")


def normalise_phone(value: str) -> str:
    """Return the tidy form of a callable number, or raise ValueError."""
    raw = value.strip()
    if not raw:
        raise ValueError("phone number is required")
    if not _ALLOWED.match(raw):
        raise ValueError("phone number may only contain digits, spaces and + ( ) - .")
    if raw.rfind("+") > 0:
        raise ValueError("+ can only appear at the start of a phone number")

    # "+44 (0)161 …": the (0) is never dialled.
    digits = re.sub(r"\D", "", raw.replace("(0)", ""))
    international = raw.startswith("+") or digits.startswith("00")
    if digits.startswith("00"):
        digits = digits[2:]

    if not international and digits in _EMERGENCY:
        raise ValueError("an emergency number is not a callback number")

    if digits.startswith("44"):
        return _uk("0" + re.sub(r"^0", "", digits[2:]))

    if international:
        if not 8 <= len(digits) <= 15:
            raise ValueError("international phone number looks incomplete")
        return f"+{digits}"

    return _uk(digits)
