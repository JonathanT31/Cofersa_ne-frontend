from datetime import datetime, timedelta

def add_business_hours(start_dt: datetime, hours: float) -> datetime:
    """
    Add business hours (Mon-Fri 07:00-16:30) to a datetime.
    Used to calculate SLA deadlines.
    """
    WORK_START = 7    # 07:00
    WORK_END   = 16   # 16:00
    WORK_END_MINS = 30 # 16:30

    remaining = hours
    current = start_dt

    def is_weekend(dt):
        return dt.weekday() >= 5  # 5=Sat, 6=Sun

    def next_business_start(dt):
        # If weekend, advance to Monday 07:00
        while is_weekend(dt):
            dt = dt.replace(hour=WORK_START, minute=0, second=0, microsecond=0) + timedelta(days=1)
        
        # If before work hours, snap to today 07:00
        if dt.hour < WORK_START:
            dt = dt.replace(hour=WORK_START, minute=0, second=0, microsecond=0)
        # If after work hours, snap to tomorrow 07:00
        elif dt.hour > WORK_END or (dt.hour == WORK_END and dt.minute >= WORK_END_MINS):
            dt = dt + timedelta(days=1)
            dt = dt.replace(hour=WORK_START, minute=0, second=0, microsecond=0)
            while is_weekend(dt):
                dt = dt + timedelta(days=1)
        
        return dt

    current = next_business_start(current)

    while remaining > 0:
        # End of current business day
        end_of_day = current.replace(hour=WORK_END, minute=WORK_END_MINS, second=0, microsecond=0)
        
        # Minutes left in current business day (in hours)
        hours_left_today = (end_of_day - current).total_seconds() / 3600
        
        if remaining <= hours_left_today:
            current = current + timedelta(hours=remaining)
            remaining = 0
        else:
            remaining -= hours_left_today
            # Jump to next business day start
            current = current + timedelta(days=1)
            current = current.replace(hour=WORK_START, minute=0, second=0, microsecond=0)
            while is_weekend(current):
                current = current + timedelta(days=1)

    return current
