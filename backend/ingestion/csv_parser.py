import csv


def _to_bool(value: str) -> bool:
    return value.strip().lower() in ("true", "1", "yes")


def parse_workers_csv(path: str) -> list[dict]:
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            try:
                rows.append(
                    {
                        "id": int(raw["id"]),
                        "name": raw["name"],
                        "x": float(raw["x"]),
                        "y": float(raw["y"]),
                        "color": raw.get("color"),
                        "can_iptv": _to_bool(raw["can_iptv"]),
                        "as_rate": float(raw["as_rate"]),
                        "region": raw.get("region"),
                    }
                )
            except (KeyError, ValueError):
                continue
    return rows
