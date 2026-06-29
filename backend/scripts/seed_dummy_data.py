"""수동 1회 실행 가상 데이터 시드 스크립트.

사용법: python -m scripts.seed_dummy_data
DATABASE_URL 환경변수가 가리키는 DB(로컬 또는 Azure)에 시드한다.
"""
import math
import random

from db import SessionLocal
from models import Customer, LegacyOrder, Worker

WORKER_NAMES = ["김민준", "이서연", "박지훈", "최수아", "정도현"]
WORKER_COLORS = ["#4f6ef7", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"]
REGIONS = {
    "A": {"cx": 0.55, "cy": 0.55, "r": 0.25},
    "B": {"cx": 0.75, "cy": 0.65, "r": 0.22},
    "C": {"cx": 0.25, "cy": 0.40, "r": 0.22},
}
SVC_POOL = ["internet", "internet", "internet", "iptv", "combo", "combo"]
REGION_KEYS = ["A", "B", "C"]

SEED = 42
WORKER_COUNT = 5
CUSTOMER_COUNT = 20
LEGACY_ORDER_COUNT = 10
LEGACY_ORDER_ID_START = 101


def build_workers() -> list[dict]:
    rng = random.Random(SEED)
    workers = []
    for i in range(WORKER_COUNT):
        workers.append(
            {
                "id": i + 1,
                "name": WORKER_NAMES[i % len(WORKER_NAMES)],
                "color": WORKER_COLORS[i % len(WORKER_COLORS)],
                "x": round(rng.uniform(0.08, 0.92), 4),
                "y": round(rng.uniform(0.08, 0.92), 4),
                "can_iptv": rng.random() > 0.3,
                "as_rate": round(rng.uniform(0.03, 0.18), 2),
                "region": REGION_KEYS[i % 3],
            }
        )
    return workers


def build_customers() -> list[dict]:
    rng = random.Random(SEED + 1)
    customers = []
    for i in range(CUSTOMER_COUNT):
        svc = SVC_POOL[rng.randint(0, len(SVC_POOL) - 1)]
        reg = REGION_KEYS[rng.randint(0, 2)]
        r_cfg = REGIONS[reg]
        angle = rng.random() * math.pi * 2
        r = rng.random() * r_cfg["r"]
        x = min(0.95, max(0.05, r_cfg["cx"] + math.cos(angle) * r))
        y = min(0.95, max(0.05, r_cfg["cy"] + math.sin(angle) * r))
        customers.append(
            {
                "id": i + 1,
                "name": f"고객{i + 1:02d}",
                "x": round(x, 4),
                "y": round(y, 4),
                "svc": svc,
                "region": reg,
                "time_window": "morning" if rng.random() > 0.5 else "afternoon",
                "vip": rng.random() > 0.8,
                "overdue": rng.random() > 0.85,
            }
        )
    return customers


def build_legacy_orders() -> list[dict]:
    """customers와 id가 겹치지 않는, '아직 우리 시스템에 안 들어온' 레거시 주문 풀.

    GET /legacy/orders/{order_id}의 온디맨드 조회 데모용 — 실제 레거시
    연동 전까지, 이 테이블이 레거시 시스템을 흉내낸다.
    """
    rng = random.Random(SEED + 2)
    orders = []
    for i in range(LEGACY_ORDER_COUNT):
        svc = SVC_POOL[rng.randint(0, len(SVC_POOL) - 1)]
        reg = REGION_KEYS[rng.randint(0, 2)]
        r_cfg = REGIONS[reg]
        angle = rng.random() * math.pi * 2
        r = rng.random() * r_cfg["r"]
        x = min(0.95, max(0.05, r_cfg["cx"] + math.cos(angle) * r))
        y = min(0.95, max(0.05, r_cfg["cy"] + math.sin(angle) * r))
        order_id = LEGACY_ORDER_ID_START + i
        orders.append(
            {
                "id": order_id,
                "name": f"고객{order_id}",
                "x": round(x, 4),
                "y": round(y, 4),
                "svc": svc,
                "region": reg,
                "time_window": "morning" if rng.random() > 0.5 else "afternoon",
                "vip": rng.random() > 0.8,
                "overdue": rng.random() > 0.85,
            }
        )
    return orders


def seed(session) -> None:
    for w in build_workers():
        session.merge(Worker(**w, source="mock"))
    for c in build_customers():
        session.merge(Customer(**c, source="mock"))
    for o in build_legacy_orders():
        session.merge(LegacyOrder(**o))
    session.commit()


if __name__ == "__main__":
    session = SessionLocal()
    try:
        seed(session)
        print(
            f"시드 완료: workers={WORKER_COUNT}, customers={CUSTOMER_COUNT}, "
            f"legacy_orders={LEGACY_ORDER_COUNT} (id {LEGACY_ORDER_ID_START}"
            f"~{LEGACY_ORDER_ID_START + LEGACY_ORDER_COUNT - 1})"
        )
    finally:
        session.close()
