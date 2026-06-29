# 프론트엔드 아키텍처 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `frontend/`를 Tailwind+shadcn/ui(스타일), Zustand(상태관리), react-leaflet(실제 지도)로 전환하고, 백엔드는 지도 정밀도를 위해 `address`/`lat`/`lng` 필드를 추가한다.

**Architecture:** 백엔드는 `Worker`/`Customer`/`LegacyOrder`에 가상 동/도로명 주소 + 실제 서울 위경도 컬럼을 추가해 `GET /workers`/`GET /customers`/`GET /legacy/orders/{id}` 응답에 포함시킨다. 프론트엔드는 전역 상태를 Zustand 단일 스토어(`store.js`)로 통합하고, `App.jsx`를 레이아웃 전용으로 축소하며, `MapCanvas.jsx`(canvas 직접 그리기)를 `MapView.jsx`(react-leaflet + CartoDB Dark Matter 타일)로 교체한다. 모든 컴포넌트는 인라인 style 대신 Tailwind 클래스와 shadcn/ui 프리미티브를 사용한다.

**Tech Stack:** React 18, Vite 5, Tailwind CSS, shadcn/ui(Radix 기반), Zustand, react-leaflet + leaflet, FastAPI, SQLAlchemy, Alembic, pytest

## Global Constraints

- `/optimize` 엔드포인트의 요청/응답 스키마는 절대 변경하지 않는다
- 기존 `x`/`y`(0~1 정규화 캔버스 좌표) 컬럼은 유지한다 — 제거하지 않는다
- Leaflet 마커는 기본 `L.Icon`이 아닌 `<CircleMarker>`를 사용한다 (Vite 기본 아이콘 경로 깨짐 회피)
- 지도 타일은 CartoDB Dark Matter (무료, API 키 불필요) 사용
- shadcn 컴포넌트는 CLI로 생성하고, 직접 손으로 작성하지 않는다
- 프론트엔드에는 테스트 프레임워크가 없다 — 검증은 `npm run dev` 수동 테스트로 한다
- 백엔드 테스트는 기존 pytest + `tests/conftest.py`의 `db_session`/`client` 픽스처를 그대로 사용한다
- 작업 브랜치: `claude/frontend-modernization`

---

## 파일 구조 개요

**백엔드 (수정만, 신규 파일 최소)**
- `backend/models.py` — `Worker`/`Customer`/`LegacyOrder`에 `address`/`lat`/`lng` 컬럼 추가
- `backend/alembic/versions/<new>.py` — 신규 마이그레이션 (down_revision=`b6fb906cf082`)
- `backend/scripts/seed_dummy_data.py` — 동 이름 풀 + 위경도 생성 로직 추가
- `backend/routers/data.py` — `WorkerOut`/`CustomerOut`에 필드 추가
- `backend/routers/legacy.py` — 업서트/응답에 필드 추가
- `backend/tests/test_seed_dummy_data.py` — 신규 필드 검증 테스트 추가
- `backend/tests/test_routers_data.py` (신규) — `/workers`,`/customers` 응답 필드 검증
- `backend/tests/test_routers_legacy.py` (신규) — `/legacy/orders/{id}` 응답 필드 검증

**프론트엔드 (신규 다수)**
- `frontend/package.json`, `frontend/tailwind.config.js`(신규), `frontend/postcss.config.js`(신규), `frontend/src/index.css`(신규)
- `frontend/components.json`(신규, shadcn 설정), `frontend/src/lib/utils.js`(신규, shadcn `cn` 헬퍼), `frontend/src/components/ui/*`(신규)
- `frontend/src/store.js`(신규)
- `frontend/src/components/MapView.jsx`(신규, `MapCanvas.jsx` 대체 — 기존 파일은 삭제)
- `frontend/src/components/SidePanel.jsx`(재작성)
- `frontend/src/components/OrderLookup.jsx`(재작성)
- `frontend/src/components/AssignTable.jsx`(신규 분리)
- `frontend/src/components/WorkerFilterList.jsx`(신규 분리)
- `frontend/src/components/Timeline.jsx`(Tailwind 스타일로 재작성, 스토어 구독)
- `frontend/src/App.jsx`(대폭 축소)

---

### Task 1: 백엔드 모델에 address/lat/lng 컬럼 추가 + 마이그레이션

**Files:**
- Modify: `backend/models.py`
- Create: `backend/alembic/versions/c1a2add3lnglat_add_address_lat_lng.py`
- Test: `backend/tests/test_models_columns.py`

**Interfaces:**
- Produces: `Worker.address: str|None`, `Worker.lat: float|None`, `Worker.lng: float|None` (동일하게 `Customer`, `LegacyOrder`에도 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

```python
# backend/tests/test_models_columns.py
from models import Customer, LegacyOrder, Worker


def test_worker_has_address_lat_lng_columns(db_session):
    w = Worker(id=1, name="테스트", address="역삼동 1길 1", lat=37.5, lng=127.0, source="mock")
    db_session.add(w)
    db_session.commit()
    fetched = db_session.get(Worker, 1)
    assert fetched.address == "역삼동 1길 1"
    assert fetched.lat == 37.5
    assert fetched.lng == 127.0


def test_customer_has_address_lat_lng_columns(db_session):
    c = Customer(id=1, name="고객1", address="잠실동 2길 3", lat=37.51, lng=127.1, source="mock")
    db_session.add(c)
    db_session.commit()
    fetched = db_session.get(Customer, 1)
    assert fetched.address == "잠실동 2길 3"
    assert fetched.lat == 37.51
    assert fetched.lng == 127.1


def test_legacy_order_has_address_lat_lng_columns(db_session):
    o = LegacyOrder(id=101, name="고객101", address="연남동 4길 5", lat=37.56, lng=126.92)
    db_session.add(o)
    db_session.commit()
    fetched = db_session.get(LegacyOrder, 101)
    assert fetched.address == "연남동 4길 5"
    assert fetched.lat == 37.56
    assert fetched.lng == 126.92
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd backend && source venv/bin/activate && python -m pytest tests/test_models_columns.py -v`
Expected: FAIL — `TypeError: 'address' is an invalid keyword argument for Worker`

- [ ] **Step 3: `models.py`에 컬럼 추가**

```python
# backend/models.py 의 Worker 클래스 내, updated_at 줄 바로 위에 추가
    address = Column(String)
    lat = Column(Float)
    lng = Column(Float)
```

Worker, Customer, LegacyOrder 세 클래스 모두 동일한 3줄을 각자의 마지막 컬럼 정의 뒤에 추가한다. 최종 형태:

```python
class Worker(Base):
    __tablename__ = "workers"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    x = Column(Float)
    y = Column(Float)
    color = Column(String)
    can_iptv = Column(Boolean)
    as_rate = Column(Float)
    region = Column(String)
    address = Column(String)
    lat = Column(Float)
    lng = Column(Float)
    source = Column(String, default="legacy_csv")
    batch_date = Column(Date)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    x = Column(Float)
    y = Column(Float)
    svc = Column(String)
    region = Column(String)
    time_window = Column(String)
    vip = Column(Boolean)
    overdue = Column(Boolean)
    address = Column(String)
    lat = Column(Float)
    lng = Column(Float)
    source = Column(String)
    batch_date = Column(Date)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class LegacyOrder(Base):
    """레거시 시스템에만 존재하는(아직 customers에 들어오지 않은) 주문 풀.

    실제 레거시 연동 전까지, GET /legacy/orders/{order_id}가 이 테이블을
    조회해 '온디맨드 조회'를 시연 가능하게 한다.
    """

    __tablename__ = "legacy_orders"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    x = Column(Float)
    y = Column(Float)
    svc = Column(String)
    region = Column(String)
    time_window = Column(String)
    vip = Column(Boolean)
    overdue = Column(Boolean)
    address = Column(String)
    lat = Column(Float)
    lng = Column(Float)
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `cd backend && source venv/bin/activate && python -m pytest tests/test_models_columns.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Alembic 마이그레이션 생성**

`backend/alembic/versions/c1a2add3lnglat_add_address_lat_lng.py` 신규 파일:

```python
"""add address/lat/lng columns

Revision ID: c1a2add3lnglat
Revises: b6fb906cf082
Create Date: 2026-06-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1a2add3lnglat'
down_revision: Union[str, None] = 'b6fb906cf082'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("workers", "customers", "legacy_orders"):
        op.add_column(table, sa.Column('address', sa.String(), nullable=True))
        op.add_column(table, sa.Column('lat', sa.Float(), nullable=True))
        op.add_column(table, sa.Column('lng', sa.Float(), nullable=True))


def downgrade() -> None:
    for table in ("workers", "customers", "legacy_orders"):
        op.drop_column(table, 'lng')
        op.drop_column(table, 'lat')
        op.drop_column(table, 'address')
```

- [ ] **Step 6: 로컬 DB에 마이그레이션 적용**

Run: `cd backend && source venv/bin/activate && DATABASE_URL=<local-or-azure-postgres-url> alembic upgrade head`
Expected: 출력에 `c1a2add3lnglat` 적용 로그

- [ ] **Step 7: 커밋**

```bash
git add backend/models.py backend/alembic/versions/c1a2add3lnglat_add_address_lat_lng.py backend/tests/test_models_columns.py
git commit -m "feat: add address/lat/lng columns to Worker, Customer, LegacyOrder"
```

---

### Task 2: seed_dummy_data.py에 동 이름 풀 + 위경도 생성 추가

**Files:**
- Modify: `backend/scripts/seed_dummy_data.py`
- Modify: `backend/tests/test_seed_dummy_data.py`

**Interfaces:**
- Consumes: Task 1의 `Worker.address/lat/lng`, `Customer.address/lat/lng`, `LegacyOrder.address/lat/lng`
- Produces: `build_workers()`, `build_customers()`, `build_legacy_orders()` 각 dict에 `address: str`, `lat: float`, `lng: float` 키 추가

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_seed_dummy_data.py` 끝에 추가:

```python
def test_build_workers_includes_address_and_coords():
    workers = build_workers()
    assert all(w["address"] for w in workers)
    assert all(37.4 <= w["lat"] <= 37.7 for w in workers)
    assert all(126.8 <= w["lng"] <= 127.2 for w in workers)


def test_build_customers_includes_address_and_coords():
    customers = build_customers()
    assert all(c["address"] for c in customers)
    assert all(37.4 <= c["lat"] <= 37.7 for c in customers)
    assert all(126.8 <= c["lng"] <= 127.2 for c in customers)


def test_build_legacy_orders_includes_address_and_coords():
    orders = build_legacy_orders()
    assert all(o["address"] for o in orders)
    assert all(37.4 <= o["lat"] <= 37.7 for o in orders)
    assert all(126.8 <= o["lng"] <= 127.2 for o in orders)


def test_address_matches_region_neighborhood_pool():
    from scripts.seed_dummy_data import REGION_NEIGHBORHOODS

    customers = build_customers()
    for c in customers:
        pool = REGION_NEIGHBORHOODS[c["region"]]
        assert any(c["address"].startswith(dong) for dong in pool)
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd backend && source venv/bin/activate && python -m pytest tests/test_seed_dummy_data.py -v`
Expected: FAIL — `KeyError: 'address'` 및 `ImportError: cannot import name 'REGION_NEIGHBORHOODS'`

- [ ] **Step 3: `seed_dummy_data.py`에 동 이름 풀과 위경도 생성 로직 추가**

`SVC_POOL = [...]` 줄 바로 아래에 추가:

```python
REGION_NEIGHBORHOODS = {
    "A": ["역삼동", "반포동", "서초동", "논현동"],
    "B": ["잠실동", "천호동", "성내동"],
    "C": ["연남동", "신촌동", "북아현동"],
}
REGION_CENTER_LATLNG = {
    "A": (37.4979, 127.0276),  # 강남/서초
    "B": (37.5145, 127.1058),  # 송파/강동
    "C": (37.5599, 126.9249),  # 마포/서대문
}
LATLNG_JITTER = 0.012  # 약 1.3km 반경


def _gen_address_and_latlng(rng: random.Random, region: str) -> dict:
    dong = REGION_NEIGHBORHOODS[region][rng.randint(0, len(REGION_NEIGHBORHOODS[region]) - 1)]
    address = f"{dong} {rng.randint(1, 30)}길 {rng.randint(1, 50)}"
    base_lat, base_lng = REGION_CENTER_LATLNG[region]
    lat = round(base_lat + rng.uniform(-LATLNG_JITTER, LATLNG_JITTER), 6)
    lng = round(base_lng + rng.uniform(-LATLNG_JITTER, LATLNG_JITTER), 6)
    return {"address": address, "lat": lat, "lng": lng}
```

`build_workers()` 내부 dict에 region을 결정한 직후 필드 추가:

```python
def build_workers() -> list[dict]:
    rng = random.Random(SEED)
    workers = []
    for i in range(WORKER_COUNT):
        region = REGION_KEYS[i % 3]
        workers.append(
            {
                "id": i + 1,
                "name": WORKER_NAMES[i % len(WORKER_NAMES)],
                "color": WORKER_COLORS[i % len(WORKER_COLORS)],
                "x": round(rng.uniform(0.08, 0.92), 4),
                "y": round(rng.uniform(0.08, 0.92), 4),
                "can_iptv": rng.random() > 0.3,
                "as_rate": round(rng.uniform(0.03, 0.18), 2),
                "region": region,
                **_gen_address_and_latlng(rng, region),
            }
        )
    return workers
```

`build_customers()`도 동일 패턴으로 수정 (region 계산 후 `**_gen_address_and_latlng(rng, reg)` 추가):

```python
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
                **_gen_address_and_latlng(rng, reg),
            }
        )
    return customers
```

`build_legacy_orders()`도 동일 패턴:

```python
def build_legacy_orders() -> list[dict]:
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
                **_gen_address_and_latlng(rng, reg),
            }
        )
    return orders
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `cd backend && source venv/bin/activate && python -m pytest tests/test_seed_dummy_data.py -v`
Expected: PASS (전체)

- [ ] **Step 5: 커밋**

```bash
git add backend/scripts/seed_dummy_data.py backend/tests/test_seed_dummy_data.py
git commit -m "feat: generate virtual address and Seoul lat/lng in seed data"
```

---

### Task 3: 라우터 응답에 address/lat/lng 노출 + 테스트

**Files:**
- Modify: `backend/routers/data.py`
- Modify: `backend/routers/legacy.py`
- Create: `backend/tests/test_routers_data.py`
- Create: `backend/tests/test_routers_legacy.py`

**Interfaces:**
- Consumes: Task 1/2의 모델 컬럼과 시드 데이터 형태
- Produces: `GET /workers`, `GET /customers` 응답 항목에 `address`, `lat`, `lng` 키; `GET /legacy/orders/{id}` 응답 dict에 동일 키

- [ ] **Step 1: 실패하는 테스트 작성**

```python
# backend/tests/test_routers_data.py
from scripts.seed_dummy_data import seed


def test_get_workers_includes_address_lat_lng(client, db_session):
    seed(db_session)
    res = client.get("/workers")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 5
    assert all("address" in w and "lat" in w and "lng" in w for w in body)
    assert all(w["address"] for w in body)


def test_get_customers_includes_address_lat_lng(client, db_session):
    seed(db_session)
    res = client.get("/customers")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 20
    assert all("address" in c and "lat" in c and "lng" in c for c in body)
    assert all(c["address"] for c in body)
```

```python
# backend/tests/test_routers_legacy.py
from scripts.seed_dummy_data import seed


def test_lookup_order_includes_address_lat_lng(client, db_session):
    seed(db_session)
    res = client.get("/legacy/orders/101")
    assert res.status_code == 200
    body = res.json()
    assert body["address"]
    assert isinstance(body["lat"], float)
    assert isinstance(body["lng"], float)


def test_lookup_order_not_found_returns_404(client, db_session):
    res = client.get("/legacy/orders/9999")
    assert res.status_code == 404
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd backend && source venv/bin/activate && python -m pytest tests/test_routers_data.py tests/test_routers_legacy.py -v`
Expected: FAIL — `assert "address" in w` 에서 KeyError류 AssertionError

- [ ] **Step 3: `routers/data.py` 스키마에 필드 추가**

```python
class WorkerOut(BaseModel):
    id: int
    name: str
    x: float | None = None
    y: float | None = None
    color: str | None = None
    can_iptv: bool | None = None
    as_rate: float | None = None
    region: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None

    class Config:
        from_attributes = True


class CustomerOut(BaseModel):
    id: int
    name: str
    x: float | None = None
    y: float | None = None
    svc: str | None = None
    region: str | None = None
    time_window: str | None = None
    vip: bool | None = None
    overdue: bool | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None

    class Config:
        from_attributes = True
```

- [ ] **Step 4: `routers/legacy.py` 업서트/응답에 필드 추가**

```python
@router.get("/orders/{order_id}")
def lookup_order(order_id: int, db: Session = Depends(get_db)):
    order = db.get(LegacyOrder, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="order not found")

    customer = Customer(
        id=order.id,
        name=order.name,
        x=order.x,
        y=order.y,
        svc=order.svc,
        region=order.region,
        time_window=order.time_window,
        vip=order.vip,
        overdue=order.overdue,
        address=order.address,
        lat=order.lat,
        lng=order.lng,
        source="ondemand",
    )
    db.merge(customer)
    db.commit()

    return {
        "id": order.id,
        "name": order.name,
        "x": order.x,
        "y": order.y,
        "svc": order.svc,
        "region": order.region,
        "time_window": order.time_window,
        "vip": order.vip,
        "overdue": order.overdue,
        "address": order.address,
        "lat": order.lat,
        "lng": order.lng,
    }
```

- [ ] **Step 5: 테스트 실행해 통과 확인**

Run: `cd backend && source venv/bin/activate && python -m pytest tests/test_routers_data.py tests/test_routers_legacy.py -v`
Expected: PASS (전체)

- [ ] **Step 6: 전체 백엔드 테스트 스위트 통과 확인**

Run: `cd backend && source venv/bin/activate && python -m pytest -v`
Expected: 전부 PASS

- [ ] **Step 7: Azure DB에 마이그레이션 적용 + 재시드**

Run:
```bash
cd backend && source venv/bin/activate
DATABASE_URL=<azure-postgres-url> alembic upgrade head
DATABASE_URL=<azure-postgres-url> python -m scripts.seed_dummy_data
```
Expected: 마이그레이션 성공 로그 + `시드 완료: workers=5, customers=20, legacy_orders=10 ...` 출력

- [ ] **Step 8: 커밋**

```bash
git add backend/routers/data.py backend/routers/legacy.py backend/tests/test_routers_data.py backend/tests/test_routers_legacy.py
git commit -m "feat: expose address/lat/lng in workers, customers, legacy order lookup responses"
```

---

### Task 4: Tailwind + shadcn/ui + Zustand + react-leaflet 패키지/툴체인 설정

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/index.css`
- Create: `frontend/components.json`
- Create: `frontend/src/lib/utils.js`
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/jsconfig.json` (없으면 생성)

**Interfaces:**
- Produces: `cn()` 헬퍼 (`frontend/src/lib/utils.js`), Tailwind 유틸리티 클래스 사용 가능, `frontend/src/components/ui/*`에 shadcn 컴포넌트 생성 가능한 상태

- [ ] **Step 1: 의존성 설치**

Run:
```bash
cd frontend
npm install zustand leaflet react-leaflet
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```
Expected: `tailwind.config.js`, `postcss.config.js` 생성, `package.json`에 의존성 추가됨

- [ ] **Step 2: `tailwind.config.js` 내용 작성**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        background: "#141720",
        surface: "#1b1e2b",
        border: "#2e3250",
        accent: "#4f6ef7",
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: `frontend/src/index.css` 생성**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
}
body {
  overflow: hidden;
  background-color: #141720;
}
```

- [ ] **Step 4: `frontend/src/main.jsx`에 CSS import 추가**

`frontend/src/main.jsx` 최상단에:

```javascript
import "./index.css";
```

(나머지 내용은 그대로 유지)

- [ ] **Step 5: `frontend/index.html`의 인라인 `<style>` 리셋 블록 제거**

기존 `<style>...</style>` 블록(box-sizing/html,body,#root 리셋)을 삭제한다 — 동일 내용이 `index.css`로 이전되었으므로 중복 제거.

- [ ] **Step 6: shadcn CLI 초기화**

Run: `cd frontend && npx shadcn@latest init`

프롬프트 응답: TypeScript 사용 안 함(No) / 스타일 New York 또는 Default(택1, Default 권장) / base color Slate / CSS variables 사용(Yes) / `src/index.css` 경로 확인 / 별칭은 기본값(`@/components`, `@/lib/utils`) 사용

Expected: `frontend/components.json` 생성, `frontend/src/lib/utils.js` 생성 (`cn` 헬퍼 포함), `tailwind.config.js`에 shadcn 테마 변수 자동 추가

- [ ] **Step 7: vite alias 설정 확인/추가 (`@/` import 지원)**

`frontend/vite.config.js`를 다음과 같이 수정 (기존 proxy 설정 유지):

```javascript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: { "/api": "http://localhost:8000" },
  },
});
```

- [ ] **Step 8: 필요한 shadcn 컴포넌트 생성**

Run: `cd frontend && npx shadcn@latest add button card badge select slider switch tabs input`
Expected: `frontend/src/components/ui/button.jsx`, `card.jsx`, `badge.jsx`, `select.jsx`, `slider.jsx`, `switch.jsx`, `tabs.jsx`, `input.jsx` 생성됨

- [ ] **Step 9: 개발 서버로 빌드 확인**

Run: `cd frontend && npm run dev`
Expected: 에러 없이 기동 (콘솔에 Tailwind/shadcn 관련 에러 없음). 브라우저로 `localhost:5173` 접속해 기존 화면이 (아직 미적용 상태라) 그대로 보이는지 확인 후 서버 종료.

- [ ] **Step 10: 커밋**

```bash
git add frontend/package.json frontend/package-lock.json frontend/tailwind.config.js frontend/postcss.config.js frontend/src/index.css frontend/components.json frontend/src/lib/utils.js frontend/src/main.jsx frontend/vite.config.js frontend/index.html frontend/src/components/ui
git commit -m "build: add Tailwind, shadcn/ui, Zustand, react-leaflet toolchain"
```

---

### Task 5: Zustand 스토어(`store.js`) 작성

**Files:**
- Create: `frontend/src/store.js`

**Interfaces:**
- Consumes: 백엔드 `GET /workers`, `GET /customers` (Task 3에서 address/lat/lng 추가됨), 환경변수 `VITE_API_URL`
- Produces:
  - State: `workers: Worker[]`, `customers: Customer[]`, `optimizedCustomers: Customer[]`, `result: object|null`, `selectedWorkerId: number|null`, `lookupAddedIds: Set<number>`, `cfg: object`, `loading: boolean`, `error: string|null`, `dataLoaded: boolean`
  - Actions: `loadInitialData(): Promise<void>`, `mergeCustomer(customer: object): void`, `runOptimize(): Promise<void>`, `setSelectedWorker(id: number|null): void`, `updateCfg(partial: object): void`

기존 `App.jsx`의 `cfg` 초기값(읽은 내용 기준)과 `handleOptimize` 로직을 그대로 옮긴다.

- [ ] **Step 1: `frontend/src/store.js` 작성**

```javascript
import { create } from "zustand";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const DEFAULT_CFG = {
  date: new Date().toISOString().slice(0, 10),
  region: "all",
  svc: "all",
  maxJobs: 8,
  routeWeight: 1,
  balanceWeight: 1,
  vip: false,
  as: false,
  overdue: false,
};

export const useStore = create((set, get) => ({
  workers: [],
  customers: [],
  optimizedCustomers: [],
  result: null,
  selectedWorkerId: null,
  lookupAddedIds: new Set(),
  cfg: { ...DEFAULT_CFG },
  loading: false,
  error: null,
  dataLoaded: false,

  loadInitialData: async () => {
    set({ loading: true, error: null });
    try {
      const [wRes, cRes] = await Promise.all([
        fetch(`${API}/workers`),
        fetch(`${API}/customers`),
      ]);
      if (!wRes.ok || !cRes.ok) throw new Error("초기 데이터 로딩 실패");
      const workers = await wRes.json();
      const customers = await cRes.json();
      set({ workers, customers, dataLoaded: true, loading: false });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },

  mergeCustomer: (customer) => {
    set((state) => {
      const exists = state.customers.some((c) => c.id === customer.id);
      const customers = exists
        ? state.customers.map((c) => (c.id === customer.id ? customer : c))
        : [...state.customers, customer];
      const lookupAddedIds = new Set(state.lookupAddedIds);
      lookupAddedIds.add(customer.id);
      return { customers, lookupAddedIds };
    });
  },

  runOptimize: async () => {
    const { cfg, customers, workers } = get();
    set({ loading: true, error: null });
    try {
      const filtered = customers.filter((c) => {
        if (cfg.region !== "all" && c.region !== cfg.region) return false;
        if (cfg.svc !== "all" && c.svc !== cfg.svc) return false;
        return true;
      });
      const res = await fetch(`${API}/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workers, customers: filtered, cfg }),
      });
      if (!res.ok) throw new Error("최적화 실행 실패");
      const result = await res.json();
      set({ result, optimizedCustomers: filtered, loading: false });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },

  setSelectedWorker: (id) => set({ selectedWorkerId: id }),

  updateCfg: (partial) =>
    set((state) => ({ cfg: { ...state.cfg, ...partial } })),
}));
```

> **주의:** `runOptimize`의 `/optimize` 호출 body 구조(`{ workers, customers, cfg }`)는 기존 `App.jsx`의 `handleOptimize`가 실제로 보내던 정확한 키 이름을 그대로 따라야 한다. 이 Task를 구현하는 엔지니어는 작업 시작 전 `git show HEAD:frontend/src/App.jsx`로 기존 `handleOptimize` 함수의 정확한 fetch body를 확인하고, 위 코드의 body 필드명을 그 구현과 정확히 일치시켜야 한다 (스키마 자체는 변경 금지 — Global Constraints 참조).

- [ ] **Step 2: 개발 서버에서 콘솔 에러 없이 import되는지 확인**

Run: `cd frontend && npm run dev`
브라우저 콘솔에서 `import { useStore } from "./store"` 형태로 임시 테스트 후 에러 없는지 확인 (이 시점에서는 아직 어떤 컴포넌트도 store를 사용하지 않으므로 단순 빌드 통과만 확인).
Expected: 빌드 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/store.js
git commit -m "feat: add Zustand store for global app state"
```

---

### Task 6: `MapView.jsx` 작성 (react-leaflet 기반, `MapCanvas.jsx` 대체)

**Files:**
- Create: `frontend/src/components/MapView.jsx`
- Delete: `frontend/src/components/MapCanvas.jsx`

**Interfaces:**
- Consumes: `useStore` (workers, customers, result, selectedWorkerId, lookupAddedIds), `SVC_LABEL` from `../utils/dataGenerator`
- Produces: default export `MapView()` — props 없음, 스토어를 직접 구독

기존 `MapCanvas.jsx`의 기능(구역 표시, 동선, 고객 노드, VIP 링, 온디맨드 링, 작업자 마커, 범례)을 react-leaflet으로 재현한다.

- [ ] **Step 1: `frontend/src/components/MapView.jsx` 작성**

```javascript
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useStore } from "../store";
import { SVC_LABEL } from "../utils/dataGenerator";

const REGION_META = {
  A: { name: "강남/서초", center: [37.4979, 127.0276] },
  B: { name: "송파/강동", center: [37.5145, 127.1058] },
  C: { name: "마포/서대문", center: [37.5599, 126.9249] },
};
const REGION_RADIUS_M = 1500;
const SEOUL_CENTER = [37.5326, 127.0184];

export default function MapView() {
  const workers = useStore((s) => s.workers);
  const result = useStore((s) => s.result);
  const optimizedCustomers = useStore((s) => s.optimizedCustomers);
  const customers = useStore((s) => s.customers);
  const selectedWorkerId = useStore((s) => s.selectedWorkerId);
  const lookupAddedIds = useStore((s) => s.lookupAddedIds);

  const displayCustomers = optimizedCustomers.length ? optimizedCustomers : customers;
  const assignments = result?.assignments || [];
  const wMap = Object.fromEntries(workers.map((w) => [w.id, w]));
  const aMap = Object.fromEntries(assignments.map((a) => [a.customer_id, { worker: wMap[a.worker_id], ...a }]));

  const routes = {};
  workers.forEach((w) => { routes[w.id] = []; });
  assignments.forEach((a) => routes[a.worker_id]?.push(a));

  const visibleWorkers = selectedWorkerId ? workers.filter((w) => w.id === selectedWorkerId) : workers;
  const visibleCustomerIds = selectedWorkerId
    ? new Set(assignments.filter((a) => a.worker_id === selectedWorkerId).map((a) => a.customer_id))
    : null;

  return (
    <div className="relative rounded-lg overflow-hidden border border-border bg-background">
      <MapContainer center={SEOUL_CENTER} zoom={12} style={{ height: 480, width: "100%" }}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        {Object.entries(REGION_META).map(([key, r]) => (
          <Circle
            key={key}
            center={r.center}
            radius={REGION_RADIUS_M}
            pathOptions={{ color: "#9db4ff", dashArray: "6,4", fillOpacity: 0.05 }}
          >
            <Popup>{key}구역 · {r.name}</Popup>
          </Circle>
        ))}

        {visibleWorkers.map((w) => {
          const jobs = (routes[w.id] || []).slice().sort((a, b) => a.start_min - b.start_min);
          if (!jobs.length || !w.lat) return null;
          const positions = [[w.lat, w.lng], ...jobs
            .map((j) => displayCustomers.find((c) => c.id === j.customer_id))
            .filter((c) => c && c.lat)
            .map((c) => [c.lat, c.lng])];
          return (
            <Polyline key={w.id} positions={positions} pathOptions={{ color: w.color, weight: 2, dashArray: "4,3", opacity: 0.6 }} />
          );
        })}

        {displayCustomers.filter((c) => c.lat && (!visibleCustomerIds || visibleCustomerIds.has(c.id))).map((c) => {
          const a = aMap[c.id];
          const color = a ? a.worker.color : "#444444";
          const isLookup = lookupAddedIds.has(c.id);
          return (
            <CircleMarker
              key={c.id}
              center={[c.lat, c.lng]}
              radius={c.vip ? 8 : 6}
              pathOptions={{
                color: c.vip ? "#f59e0b" : isLookup ? "#67dff0" : color,
                weight: c.vip || isLookup ? 2 : 1,
                fillColor: color,
                fillOpacity: 0.85,
                dashArray: isLookup ? "2,2" : undefined,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-bold">{c.name}</div>
                  <div>{c.address}</div>
                  <div>{SVC_LABEL[c.svc]}</div>
                  <div>{c.region}구역</div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {visibleWorkers.filter((w) => w.lat).map((w) => (
          <CircleMarker key={w.id} center={[w.lat, w.lng]} radius={10} pathOptions={{ color: "#fff", weight: 2, fillColor: w.color, fillOpacity: 1 }}>
            <Popup>{w.name}</Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className="absolute top-3 right-3 bg-surface/90 border border-border rounded-lg p-3 text-xs text-gray-300 space-y-1 max-w-[180px]">
        {workers.map((w) => (
          <div key={w.id} className="flex items-center gap-2">
            <span className="w-4 h-[3px] rounded" style={{ background: w.color }} />
            {w.name}
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: "#f59e0b" }} />
          VIP 고객
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full border" style={{ borderColor: "#67dff0", borderStyle: "dashed" }} />
          🔍 온디맨드 조회로 추가됨
        </div>
        <div className="border-t border-border pt-2 mt-1 space-y-1">
          {Object.entries(REGION_META).map(([key, r]) => (
            <div key={key} className="flex items-center gap-2 text-[#9db4ff]">
              <span className="w-3 h-3 rounded-full border" style={{ borderColor: "#9db4ff", borderStyle: "dashed" }} />
              {key}구역 · {r.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 기존 `MapCanvas.jsx` 삭제**

```bash
rm frontend/src/components/MapCanvas.jsx
```

- [ ] **Step 3: 수동 검증**

Run: `cd frontend && npm run dev`

브라우저로 확인:
- 지도가 서울 영역에 다크 타일로 표시되는지
- 워커/고객 마커가 실제 위경도 위치에 찍히는지 (콘솔 에러 없음)
- 마커 클릭 시 팝업에 주소가 표시되는지
- 구역 원이 점선으로 표시되는지

Expected: 위 항목 모두 정상 동작 (Task 9에서 App.jsx가 MapView를 사용하도록 연결되기 전까지는 아직 화면에 나타나지 않을 수 있음 — 이 경우 임시로 `App.jsx`에 `<MapView />`를 추가해 확인 후 되돌린다)

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/MapView.jsx
git rm frontend/src/components/MapCanvas.jsx
git commit -m "feat: replace canvas map with react-leaflet MapView"
```

---

### Task 7: `SidePanel.jsx`를 Zustand cfg 구독으로 재작성

**Files:**
- Modify: `frontend/src/components/SidePanel.jsx`

**Interfaces:**
- Consumes: `useStore` (`cfg`, `updateCfg`, `runOptimize`, `loading`), shadcn `Select`/`Slider`/`Switch`/`Button`/`Card`
- Produces: default export `SidePanel()` — props 없음 (기존에 props로 받던 `cfg`/`onChange`/`onOptimize`/`loading` 제거)

- [ ] **Step 1: `frontend/src/components/SidePanel.jsx` 재작성**

```javascript
import { useStore } from "../store";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";

const STRENGTH = ["약", "중", "강", "최강"];

export default function SidePanel() {
  const cfg = useStore((s) => s.cfg);
  const updateCfg = useStore((s) => s.updateCfg);
  const runOptimize = useStore((s) => s.runOptimize);
  const loading = useStore((s) => s.loading);

  return (
    <Card className="bg-surface border-border text-gray-200">
      <CardHeader>
        <CardTitle className="text-base">최적화 설정</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs text-gray-400">날짜</label>
          <input
            type="date"
            value={cfg.date}
            onChange={(e) => updateCfg({ date: e.target.value })}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400">구역</label>
          <Select value={cfg.region} onValueChange={(v) => updateCfg({ region: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="A">A · 강남/서초</SelectItem>
              <SelectItem value="B">B · 송파/강동</SelectItem>
              <SelectItem value="C">C · 마포/서대문</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400">서비스</label>
          <Select value={cfg.svc} onValueChange={(v) => updateCfg({ svc: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="internet">인터넷</SelectItem>
              <SelectItem value="iptv">IPTV</SelectItem>
              <SelectItem value="combo">결합</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400">작업자당 최대 건수: {cfg.maxJobs}</label>
          <Slider min={1} max={15} step={1} value={[cfg.maxJobs]} onValueChange={([v]) => updateCfg({ maxJobs: v })} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400">동선 최적화 강도: {STRENGTH[cfg.routeWeight]}</label>
          <Slider min={0} max={3} step={1} value={[cfg.routeWeight]} onValueChange={([v]) => updateCfg({ routeWeight: v })} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400">작업량 균형 강도: {STRENGTH[cfg.balanceWeight]}</label>
          <Slider min={0} max={3} step={1} value={[cfg.balanceWeight]} onValueChange={([v]) => updateCfg({ balanceWeight: v })} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm">VIP 우선</span>
          <Switch checked={cfg.vip} onCheckedChange={(v) => updateCfg({ vip: v })} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">AS 가능자만</span>
          <Switch checked={cfg.as} onCheckedChange={(v) => updateCfg({ as: v })} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">연체 우선</span>
          <Switch checked={cfg.overdue} onCheckedChange={(v) => updateCfg({ overdue: v })} />
        </div>

        <Button className="w-full" disabled={loading} onClick={runOptimize}>
          {loading ? "최적화 중..." : "최적화 실행"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

> **주의:** 이 Task를 구현하는 엔지니어는 작업 시작 전 `git show HEAD:frontend/src/App.jsx`와 `git show HEAD:frontend/src/components/SidePanel.jsx`로 기존 `cfg` 필드 전체 목록과 기존 `Toggle`/`RangeField`/`Section`/`Field`/`ToggleRow` 서브컴포넌트가 렌더링하던 모든 필드를 확인하고, 위 코드에 빠진 필드가 없는지 대조해야 한다. 위 코드는 요약 정보 기준 필드 목록(`date, region, svc, maxJobs, routeWeight, balanceWeight, vip, as, overdue`)을 모두 포함하지만, 라벨 문구나 옵션 값(`region`/`svc`의 정확한 value 문자열)은 기존 구현과 일치시켜야 한다.

- [ ] **Step 2: 수동 검증**

Run: `cd frontend && npm run dev`
브라우저에서 모든 입력 필드를 조작 → React DevTools 또는 임시 `console.log(useStore.getState().cfg)`로 변경이 store에 반영되는지 확인.
Expected: 모든 필드 변경이 `cfg`에 즉시 반영됨

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/SidePanel.jsx
git commit -m "refactor: rewrite SidePanel with Zustand store and shadcn components"
```

---

### Task 8: `OrderLookup.jsx` 재작성 (Zustand + shadcn + address 표시)

**Files:**
- Modify: `frontend/src/components/OrderLookup.jsx`

**Interfaces:**
- Consumes: `useStore` (`mergeCustomer`), 기존 `GET {API}/legacy/orders/{id}` 호출 패턴, `SVC_LABEL`
- Produces: default export `OrderLookup()` — props 없음

- [ ] **Step 1: `frontend/src/components/OrderLookup.jsx` 재작성**

```javascript
import { useState } from "react";
import { useStore } from "../store";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { SVC_LABEL } from "../utils/dataGenerator";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function OrderLookup() {
  const mergeCustomer = useStore((s) => s.mergeCustomer);
  const [orderId, setOrderId] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);

  const handleLookup = async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAdded(false);
    try {
      const res = await fetch(`${API}/legacy/orders/${orderId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("해당 주문번호를 찾을 수 없습니다");
        if (res.status === 503) throw new Error("레거시 시스템에 연결할 수 없습니다");
        throw new Error("조회 중 오류가 발생했습니다");
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    if (!result) return;
    mergeCustomer(result);
    setAdded(true);
  };

  return (
    <Card className="bg-surface border-border text-gray-200 max-w-md">
      <CardHeader>
        <CardTitle className="text-base">🔍 온디맨드 주문 조회</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="주문번호 (예: 101)"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLookup()}
          />
          <Button onClick={handleLookup} disabled={loading}>
            {loading ? "조회 중..." : "조회"}
          </Button>
        </div>

        {error && <div className="text-sm text-red-400">{error}</div>}

        {result && (
          <div className="border border-border rounded-lg p-3 space-y-1 text-sm">
            <div className="font-bold">{result.name}</div>
            <div className="text-gray-400">{result.address}</div>
            <div className="flex gap-2 items-center">
              <Badge variant="outline">{SVC_LABEL[result.svc]}</Badge>
              {result.vip && <Badge className="bg-amber-500">VIP</Badge>}
              {result.overdue && <Badge variant="destructive">연체</Badge>}
            </div>
            <Button size="sm" className="mt-2" disabled={added} onClick={handleAdd}>
              {added ? "추가됨" : "최적화 대상에 추가"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

> **주의:** 구현 엔지니어는 작업 시작 전 `git show HEAD:frontend/src/components/OrderLookup.jsx`로 기존 에러 메시지 문구, 503/404 처리 분기, `SVC_LABEL` import 방식을 정확히 확인하고 위 코드와 대조해 동일한 에러 처리 동작을 유지해야 한다 (특히 503 처리는 이번 세션 초반에 수정된 버그 픽스와 연관되어 있어 회귀시키면 안 됨).

- [ ] **Step 2: 수동 검증**

Run: `cd frontend && npm run dev`
브라우저에서: 주문번호 `101` 조회 → 결과 카드에 주소 표시 확인 → "최적화 대상에 추가" 클릭 → `added` 상태로 버튼 텍스트 변경 확인. 존재하지 않는 번호(`9999`) 조회 → 404 에러 메시지 확인.
Expected: 정상 동작, 에러 메시지가 화면 전체에 영향 주지 않고 카드 내부에만 표시됨

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/OrderLookup.jsx
git commit -m "refactor: rewrite OrderLookup with Zustand store and shadcn components"
```

---

### Task 9: `AssignTable.jsx`/`WorkerFilterList.jsx` 분리 + `App.jsx` 축소

**Files:**
- Create: `frontend/src/components/AssignTable.jsx`
- Create: `frontend/src/components/WorkerFilterList.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `useStore` (전체), `git show HEAD:frontend/src/App.jsx`의 기존 `WorkerFilterList`/`AssignTable`/`LogView` 인라인 구현
- Produces: `AssignTable()` default export (props 없음), `WorkerFilterList()` default export (props 없음), 축소된 `App()` — 로컬 상태는 `tab`만 유지

이 Task를 시작하기 전, 구현 엔지니어는 반드시 `git show HEAD:frontend/src/App.jsx` 전체를 읽어 다음을 확인해야 한다(요약 정보에 일부만 기록되어 있어 정확한 재현을 위해 원문 대조가 필수):
- `WorkerFilterList`의 정확한 클릭 토글 동작 (같은 워커 재클릭 시 해제되는지)
- `AssignTable`의 정확한 컬럼 목록과 "구역" 컬럼, "🔍 온디맨드 조회" 배지 렌더링 조건
- `displayAssignments`/`displayWorkers`/`displayCustomers`/`jobCountByWorker` 파생값 계산 로직
- `LogView`의 렌더링 내용

- [ ] **Step 1: `frontend/src/components/WorkerFilterList.jsx` 작성**

```javascript
import { useStore } from "../store";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export default function WorkerFilterList() {
  const workers = useStore((s) => s.workers);
  const result = useStore((s) => s.result);
  const selectedWorkerId = useStore((s) => s.selectedWorkerId);
  const setSelectedWorker = useStore((s) => s.setSelectedWorker);

  const assignments = result?.assignments || [];
  const jobCountByWorker = Object.fromEntries(
    workers.map((w) => [w.id, assignments.filter((a) => a.worker_id === w.id).length])
  );

  return (
    <Card className="bg-surface border-border text-gray-200">
      <CardHeader>
        <CardTitle className="text-base">작업자별 필터</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <button
          onClick={() => setSelectedWorker(null)}
          className={`w-full text-left px-3 py-1.5 rounded text-sm ${selectedWorkerId === null ? "bg-accent text-white" : "hover:bg-background"}`}
        >
          전체 보기
        </button>
        {workers.map((w) => (
          <button
            key={w.id}
            onClick={() => setSelectedWorker(selectedWorkerId === w.id ? null : w.id)}
            className={`w-full flex items-center justify-between px-3 py-1.5 rounded text-sm ${selectedWorkerId === w.id ? "bg-accent text-white" : "hover:bg-background"}`}
          >
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: w.color }} />
              {w.name}
            </span>
            <span className="text-xs text-gray-400">{jobCountByWorker[w.id] || 0}건</span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: `frontend/src/components/AssignTable.jsx` 작성**

```javascript
import { useStore } from "../store";
import { Badge } from "./ui/badge";
import { SVC_LABEL } from "../utils/dataGenerator";

export default function AssignTable() {
  const workers = useStore((s) => s.workers);
  const customers = useStore((s) => s.customers);
  const optimizedCustomers = useStore((s) => s.optimizedCustomers);
  const result = useStore((s) => s.result);
  const selectedWorkerId = useStore((s) => s.selectedWorkerId);
  const lookupAddedIds = useStore((s) => s.lookupAddedIds);

  const displayCustomers = optimizedCustomers.length ? optimizedCustomers : customers;
  const wMap = Object.fromEntries(workers.map((w) => [w.id, w]));
  const assignments = (result?.assignments || []).filter(
    (a) => !selectedWorkerId || a.worker_id === selectedWorkerId
  );

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm text-gray-200">
        <thead className="bg-background text-gray-400">
          <tr>
            <th className="px-3 py-2 text-left">작업자</th>
            <th className="px-3 py-2 text-left">고객</th>
            <th className="px-3 py-2 text-left">서비스</th>
            <th className="px-3 py-2 text-left">구역</th>
            <th className="px-3 py-2 text-left">시작</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => {
            const c = displayCustomers.find((c) => c.id === a.customer_id);
            const w = wMap[a.worker_id];
            return (
              <tr key={a.customer_id} className="border-t border-border">
                <td className="px-3 py-2">{w?.name}</td>
                <td className="px-3 py-2 flex items-center gap-2">
                  {c?.name}
                  {lookupAddedIds.has(a.customer_id) && (
                    <Badge variant="outline" className="text-cyan-400 border-cyan-400">🔍 온디맨드 조회</Badge>
                  )}
                  {c?.vip && <Badge className="bg-amber-500">VIP</Badge>}
                </td>
                <td className="px-3 py-2">{c ? SVC_LABEL[c.svc] : "-"}</td>
                <td className="px-3 py-2">{c?.address || c?.region}</td>
                <td className="px-3 py-2">{a.start_min != null ? `${Math.floor(a.start_min / 60)}:${String(a.start_min % 60).padStart(2, "0")}` : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: `App.jsx` 축소**

기존 `App.jsx`를 읽고(`git show HEAD:frontend/src/App.jsx`), `TABS`, `tab` 로컬 상태, 초기 로딩 `useEffect`(→ `loadInitialData` 호출로 교체), 레이아웃 구조만 남기고 나머지 로직(상태/핸들러/인라인 컴포넌트)을 모두 제거한다:

```javascript
import { useEffect, useState } from "react";
import { useStore } from "./store";
import SidePanel from "./components/SidePanel";
import MapView from "./components/MapView";
import AssignTable from "./components/AssignTable";
import WorkerFilterList from "./components/WorkerFilterList";
import Timeline from "./components/Timeline";
import OrderLookup from "./components/OrderLookup";

const TABS = [
  { key: "map", label: "지도" },
  { key: "timeline", label: "타임라인" },
  { key: "table", label: "배정목록" },
  { key: "log", label: "최적화 로그" },
  { key: "lookup", label: "🔍 주문 조회" },
];

export default function App() {
  const [tab, setTab] = useState("map");
  const loadInitialData = useStore((s) => s.loadInitialData);
  const dataLoaded = useStore((s) => s.dataLoaded);
  const error = useStore((s) => s.error);
  const result = useStore((s) => s.result);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  return (
    <div className="h-full w-full flex bg-background text-gray-100">
      <aside className="w-72 p-4 space-y-4 overflow-y-auto border-r border-border">
        <SidePanel />
        <WorkerFilterList />
      </aside>

      <main className="flex-1 p-4 overflow-y-auto">
        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-300 rounded-lg px-4 py-2 mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded text-sm ${tab === t.key ? "bg-accent text-white" : "bg-surface text-gray-400 hover:text-gray-200"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!dataLoaded && <div className="text-gray-400">데이터 로딩 중...</div>}

        {dataLoaded && tab === "map" && <MapView />}
        {dataLoaded && tab === "timeline" && <Timeline />}
        {dataLoaded && tab === "table" && <AssignTable />}
        {dataLoaded && tab === "log" && (
          <pre className="text-xs text-gray-400 whitespace-pre-wrap">
            {result ? JSON.stringify(result.log || result, null, 2) : "최적화를 실행하면 로그가 표시됩니다."}
          </pre>
        )}
        {dataLoaded && tab === "lookup" && <OrderLookup />}
      </main>
    </div>
  );
}
```

> **주의:** 기존 `LogView`가 단순 JSON 출력이 아닌 별도 포맷팅을 했다면(요약 정보에 상세 내용 없음), `git show HEAD:frontend/src/App.jsx`에서 `LogView` 구현을 그대로 가져와 위 `log` 탭 블록을 대체해야 한다.

- [ ] **Step 4: `Timeline.jsx`를 스토어 구독 + Tailwind로 전환**

`git show HEAD:frontend/src/components/Timeline.jsx`의 기존 렌더링 로직(워커 요약 카드 + 시간대 그리드)을 유지하면서, props 대신 `useStore`에서 `workers`, `customers`(또는 `optimizedCustomers`), `result.assignments`를 읽도록 수정하고 인라인 style을 Tailwind 클래스로 교체한다. 시각적 출력(카드 레이아웃, 시간 그리드 좌표 계산)은 기존과 동일하게 유지한다.

- [ ] **Step 5: 수동 통합 검증**

Run: `cd frontend && npm run dev`

브라우저로 전체 플로우 확인:
- 초기 로딩 → 지도/타임라인/배정목록 데이터 표시
- SidePanel 설정 변경 → "최적화 실행" → 결과가 지도/타임라인/배정목록에 모두 반영
- 작업자 필터 클릭 → 지도/배정목록이 필터링됨
- 온디맨드 조회 → 추가 → 배정목록에 배지 표시
- 탭 전환이 모두 정상 동작

Expected: 모든 항목 정상 동작, 콘솔 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/components/AssignTable.jsx frontend/src/components/WorkerFilterList.jsx frontend/src/components/Timeline.jsx frontend/src/App.jsx
git commit -m "refactor: extract AssignTable/WorkerFilterList, slim down App.jsx to layout only"
```

---

## 최종 점검

- [ ] **백엔드 전체 테스트**: `cd backend && source venv/bin/activate && python -m pytest -v` → 전부 PASS
- [ ] **프론트엔드 빌드**: `cd frontend && npm run build` → 에러 없이 빌드 성공
- [ ] **`infra/AZURE_SETUP_LOG.md` 업데이트**: Azure DB에 마이그레이션/재시드를 적용했다면 날짜/명령/결과를 기록하고 커밋 (CLAUDE.md 작업 방식 규칙)
- [ ] **CI/CD 배포 브랜치 확인**: `claude/frontend-modernization`은 현재 GitHub Actions 트리거 브랜치 목록(`main`, `claude/scheduling-optimizer-setup-wcrh8t`, 임시 추가된 `claude/legacy-ui-mockup`)에 없으므로, 데모 배포가 필요하면 사용자에게 트리거 브랜치 추가 여부를 확인한다 (자동으로 추가하지 않음)
