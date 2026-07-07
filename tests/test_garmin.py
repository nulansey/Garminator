import pytest

from src.garmin import yesterday_burn


def make(summaries):
    return {"daily_summaries": summaries}


def test_uses_yesterdays_total_burn():
    data = make({
        "2026-07-06": {"totalKilocalories": 2100},
        "2026-07-05": {"totalKilocalories": 2600},
    })
    assert yesterday_burn(data) == (2600, False)


def test_falls_back_to_average_when_yesterday_missing():
    data = make({
        "2026-07-06": {"totalKilocalories": 2100},
        "2026-07-05": {"totalKilocalories": None},
        "2026-07-04": {"totalKilocalories": 2500},
    })
    # average of the days that DO have data: (2100 + 2500) / 2
    assert yesterday_burn(data) == (2300, True)


def test_raises_when_no_data_at_all():
    data = make({"2026-07-06": {}, "2026-07-05": {}})
    with pytest.raises(RuntimeError):
        yesterday_burn(data)
