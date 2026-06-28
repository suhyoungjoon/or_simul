from contextlib import contextmanager
from datetime import datetime, timezone

from models import LegacySyncLog


class _SyncContext:
    def __init__(self):
        self.records = 0


@contextmanager
def sync_run(db, job_type: str):
    log = LegacySyncLog(
        job_type=job_type,
        started_at=datetime.now(timezone.utc),
        status="running",
        records_processed=0,
    )
    db.add(log)
    db.commit()

    ctx = _SyncContext()
    try:
        yield ctx
    except Exception as exc:
        log.status = "failed"
        log.error_message = str(exc)
        log.finished_at = datetime.now(timezone.utc)
        log.records_processed = ctx.records
        db.commit()
        raise
    else:
        log.status = "success"
        log.records_processed = ctx.records
        log.finished_at = datetime.now(timezone.utc)
        db.commit()
