"""Fetch and curate the user's Garmin Connect data."""
import datetime
import os

from garminconnect import Garmin

TOKENSTORE = os.environ.get("GARMINTOKENS", "~/.garminconnect")

SUMMARY_FIELDS = (
    "totalKilocalories",
    "activeKilocalories",
    "bmrKilocalories",
    "totalSteps",
    "totalDistanceMeters",
    "restingHeartRate",
    "averageStressLevel",
    "moderateIntensityMinutes",
    "vigorousIntensityMinutes",
    "bodyBatteryHighestValue",
    "bodyBatteryLowestValue",
    "sleepingSeconds",
)


def connect():
    """Log in with the saved token store (created once by setup_auth)."""
    api = Garmin()
    api.login(TOKENSTORE)
    return api


def fetch_data(today):
    """Pull the last 7 days of metrics, curated down to the fields the tip needs.

    Curating (rather than dumping raw responses) keeps the Claude prompt small —
    raw stress/body-battery series are thousands of data points.
    """
    api = connect()
    days = [(today - datetime.timedelta(days=i)).isoformat() for i in range(7)]

    summaries = {}
    for d in days:
        s = api.get_user_summary(d) or {}
        summaries[d] = {k: s.get(k) for k in SUMMARY_FIELDS}

    sleep_raw = api.get_sleep_data(days[0]) or {}
    dto = sleep_raw.get("dailySleepDTO") or {}
    sleep = {
        "sleepTimeSeconds": dto.get("sleepTimeSeconds"),
        "deepSleepSeconds": dto.get("deepSleepSeconds"),
        "remSleepSeconds": dto.get("remSleepSeconds"),
        "awakeSleepSeconds": dto.get("awakeSleepSeconds"),
        "sleepScore": ((dto.get("sleepScores") or {}).get("overall") or {}).get("value"),
    }

    hrv_raw = api.get_hrv_data(days[0]) or {}
    hrv = hrv_raw.get("hrvSummary") or {}

    activities = [
        {
            "name": a.get("activityName"),
            "type": (a.get("activityType") or {}).get("typeKey"),
            "start": a.get("startTimeLocal"),
            "durationSeconds": a.get("duration"),
            "calories": a.get("calories"),
        }
        for a in (api.get_activities_by_date(days[-1], days[0]) or [])
    ]

    return {
        "today": days[0],
        "daily_summaries": summaries,
        "last_night_sleep": sleep,
        "hrv_summary": hrv,
        "recent_activities": activities,
    }


def yesterday_burn(data):
    """Yesterday's total kcal burned, or the 7-day average if yesterday is missing.

    Returns (kcal, used_fallback).
    """
    days = sorted(data["daily_summaries"], reverse=True)
    yesterday = data["daily_summaries"].get(days[1], {}) if len(days) > 1 else {}
    burn = yesterday.get("totalKilocalories")
    if burn:
        return int(burn), False
    values = [
        s.get("totalKilocalories")
        for s in data["daily_summaries"].values()
        if s and s.get("totalKilocalories")
    ]
    if not values:
        raise RuntimeError("no calorie data in the last 7 days (was the watch worn?)")
    return int(sum(values) / len(values)), True
