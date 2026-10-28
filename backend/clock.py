"""Pakistan time. Servers usually run on UTC; trip dates, forecasts and 'today' are Pakistani."""
from datetime import date, datetime, timedelta, timezone

PKT = timezone(timedelta(hours=5), "PKT")


def now_pk() -> datetime:
    return datetime.now(PKT)


def today_pk() -> date:
    return now_pk().date()
