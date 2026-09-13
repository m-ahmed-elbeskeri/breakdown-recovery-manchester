import pytest

from app.phone import normalise_phone


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("07700900123", "07700 900123"),
        ("+44 7700 900123", "07700 900123"),
        ("0044 7700 900123", "07700 900123"),
        ("447700900123", "07700 900123"),
        ("+44 (0)7700 900123", "07700 900123"),
        ("07624 123456", "07624 123456"),
        ("(0161) 496-0000", "0161 496 0000"),
        ("02079460018", "020 7946 0018"),
        ("03001234567", "0300 123 4567"),
        ("01204 123456", "01204 123456"),
        ("0169771234", "01697 71234"),
        ("+33 6 12 34 56 78", "+33612345678"),
    ],
)
def test_callable_numbers_are_tidied(raw, expected):
    assert normalise_phone(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "1234567",
        "call me",
        "07700 90012",
        "077009001234",
        "0161 496 000",
        "09001234567",
        "08001234567",
        "07012345678",
        "07612345678",
        "999",
        "0770+0900123",
        "+33 612",
    ],
)
def test_numbers_nobody_can_ring_back_are_refused(raw):
    with pytest.raises(ValueError):
        normalise_phone(raw)
