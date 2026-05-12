from datetime import datetime, timedelta

def add_business_hours(start_dt: datetime, hours: float) -> datetime:
    """Add business hours (Mon-Fri 07:00-16:30) to a datetime."""
    WORK_START = 7    # 07:00
    WORK_END   = 16.5 # 16:30

    remaining = hours
    current = start_dt

    def is_business_day(dt):
        return dt.weekday() < 5

    def get_next_business_start(dt):
        dt = dt + timedelta(days=1)
        dt = dt.replace(hour=WORK_START, minute=0, second=0, microsecond=0)
        while not is_business_day(dt):
            dt = dt + timedelta(days=1)
        return dt

    # Snap to business hours if outside
    if not is_business_day(current):
        current = get_next_business_start(current)

    current_hour = current.hour + current.minute/60
    if current_hour < WORK_START:
        current = current.replace(hour=WORK_START, minute=0, second=0)
    elif current_hour >= WORK_END:
        current = get_next_business_start(current)

    while remaining > 0:
        current_hour = current.hour + current.minute/60
        hours_left_today = WORK_END - current_hour

        if remaining <= hours_left_today:
            current = current + timedelta(hours=remaining)
            remaining = 0
        else:
            remaining -= hours_left_today
            current = get_next_business_start(current)

    return current
