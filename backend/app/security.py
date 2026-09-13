"""Passwords and the tokens handed to browsers.

Passwords are hashed with scrypt from the standard library: memory-hard, no
extra dependency to install on the server, and the parameters are stored with
each hash so they can be raised later without invalidating anyone.

Session, reset and invite tokens are random strings given to the browser once.
Only their SHA-256 is stored, so a copy of the database cannot be replayed as
anybody's login.
"""

import base64
import hashlib
import hmac
import secrets

SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 32

PASSWORD_MIN_LENGTH = 10
PASSWORD_MAX_LENGTH = 200

# Not an exhaustive list: the length rule does most of the work. These are the
# ten-character passwords people reach for first, several of them local.
COMMON_PASSWORDS = {
    "password12",
    "password123",
    "password1234",
    "passw0rd123",
    "1234567890",
    "0987654321",
    "qwertyuiop",
    "qwerty1234",
    "1q2w3e4r5t",
    "letmein123",
    "welcome123",
    "iloveyou12",
    "football12",
    "manchester",
    "manchester1",
    "recovery123",
    "abc1234567",
}


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(digest)}"


# Checked against when the account does not exist or has no password yet, so a
# wrong email takes as long to reject as a wrong password. Otherwise the
# response time alone would say which email addresses have accounts.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def verify_password(password: str, stored: str | None) -> bool:
    target = stored or _DUMMY_HASH
    try:
        scheme, n, r, p, salt, digest = target.split("$")
        if scheme != "scrypt":
            return False
        expected = _unb64(digest)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=_unb64(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected) and stored is not None


def password_problem(password: str, email: str | None = None) -> str | None:
    """Why a password will not do, in words for the person choosing it."""
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"Use at least {PASSWORD_MIN_LENGTH} characters."
    if len(password) > PASSWORD_MAX_LENGTH:
        return "That password is too long."
    lowered = password.lower()
    if lowered in COMMON_PASSWORDS or len(set(password)) < 4:
        return "That password is too easy to guess. A short phrase works well."
    if email:
        local = email.split("@", 1)[0].lower()
        if len(local) >= 4 and local in lowered:
            return "Don't use your email address in your password."
    return None


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
