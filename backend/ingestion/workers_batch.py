import os
from datetime import date

from db import SessionLocal
from ingestion.csv_parser import parse_workers_csv
from ingestion.sync_log import sync_run
from models import Worker

WORKERS_CSV_DIR = os.environ.get("WORKERS_CSV_DIR", "/data/legacy/workers")
WORKERS_CSV_FILENAME = os.environ.get("WORKERS_CSV_FILENAME", "workers.csv")


def run(db, csv_dir: str | None = None, filename: str | None = None):
    csv_dir = csv_dir or WORKERS_CSV_DIR
    filename = filename or WORKERS_CSV_FILENAME
    path = os.path.join(csv_dir, filename)

    with sync_run(db, "workers_batch") as ctx:
        rows, skipped = parse_workers_csv(path)
        if skipped:
            print(f"workers_batch: skipped {skipped} malformed row(s) in {path}")
        for row in rows:
            db.merge(
                Worker(
                    id=row["id"],
                    name=row["name"],
                    x=row["x"],
                    y=row["y"],
                    color=row.get("color"),
                    can_iptv=row["can_iptv"],
                    as_rate=row["as_rate"],
                    region=row.get("region"),
                    source="legacy_csv",
                    batch_date=date.today(),
                )
            )
        db.commit()
        ctx.records = len(rows)


def main():
    db = SessionLocal()
    try:
        run(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
