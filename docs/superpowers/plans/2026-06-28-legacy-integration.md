# 레거시 연동 (작업자/주문 데이터 → DB) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** backend에 PostgreSQL 영속 계층을 처음 도입하고, 레거시 시스템에서 주문(배치+온디맨드) 및 작업자(배치 CSV) 데이터를 가져와 DB에 적재하는 파이프라인을 구축한다.

**Architecture:** `backend/db.py`(SQLAlchemy 세션)와 `backend/models.py`(Worker/Customer/LegacySyncLog) 위에, 기존 FastAPI 앱(`ca-scheduling-backend`)에는 조회/온디맨드 라우터를 추가하고, 별도 `backend/ingestion/` 모듈(향후 Azure Container Apps Job으로 배포)이 일배치를 수행한다. `/optimize`는 변경하지 않는다.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Alembic, httpx(레거시 API 클라이언트), pytest, SQLite(테스트용 인메모리 DB), PostgreSQL(운영 DB, 기존 `psql-scheduling-optimizer`)

## Global Constraints

- `/optimize` 엔드포인트의 요청/응답 스키마는 변경하지 않는다 (기존 호환성 유지) — [spec](../specs/2026-06-28-legacy-integration-design.md) "데이터 흐름 > `/optimize` 연동"
- 레거시 고유 ID를 PK로 사용하고 upsert는 멱등성을 가져야 한다 — [spec](../specs/2026-06-28-legacy-integration-design.md) "DB 스키마"
- 공유 폴더 경로는 환경변수로 설정 가능해야 한다 (네트워크 연결 방식은 범위 밖) — [spec](../specs/2026-06-28-legacy-integration-design.md) "요구사항 정리"
- 배치 실행 결과는 `legacy_sync_log`에 기록되어야 한다 — [spec](../specs/2026-06-28-legacy-integration-design.md) "에러 처리 & 모니터링"
- `ca-ingestion`의 CI/CD 자동화, Azure 배포는 이번 계획의 범위 밖이다 (사용자 지시: "나중에 넣어줘") — 코드와 로컬 실행/테스트까지만 다룬다

---

## File Structure

```
backend/
  db.py                      # SQLAlchemy engine, SessionLocal, Base, get_db()
  models.py                  # Worker, Customer, LegacySyncLog ORM 모델
  legacy_client.py           # LegacyClient: fetch_orders(), fetch_order()
  routers/
    __init__.py
    data.py                  # GET /workers, GET /customers
    legacy.py                # POST /legacy/orders/lookup
  ingestion/
    __init__.py
    csv_parser.py            # parse_workers_csv()
    sync_log.py               # sync_run() 컨텍스트 매니저
    orders_batch.py           # 주문 배치 entrypoint (main())
    workers_batch.py          # 작업자 배치 entrypoint (main())
    Dockerfile                # ingestion Job용 이미지
  alembic/
    env.py
    versions/
      0001_initial.py
  alembic.ini
  main.py                    # 라우터 include, DB 세션 wiring (수정)
  requirements.txt           # sqlalchemy, psycopg2-binary, alembic, httpx, respx, pytest 추가 (수정)
  tests/
    __init__.py
    conftest.py               # 테스트 DB 픽스처
    test_models_upsert.py
    test_legacy_client.py
    test_csv_parser.py
    test_data_router.py
    test_legacy_router.py
    fixtures/
      workers_sample.csv
```

---

### Task 1: DB 계층(engine/session) + Alembic 초기 설정

**Files:**
- Create: `backend/db.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Modify: `backend/requirements.txt`
- Test: `backend/tests/test_db.py`

**Interfaces:**
- Produces: `db.Base` (SQLAlchemy declarative base), `db.engine`, `db.SessionLocal`, `db.get_db()` (FastAPI dependency generator yielding a `Session`)

- [ ] **Step 1: requirements.txt에 의존성 추가**

`backend/requirements.txt` 전체를 다음으로 교체:

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
pydantic==2.7.1
prometheus-fastapi-instrumentator==7.0.0
sqlalchemy==2.0.30
psycopg2-binary==2.9.9
alembic==1.13.1
httpx==0.27.0

pytest==8.2.0
respx==0.21.1
```

- [ ] **Step 2: 의존성 설치**

Run: `cd backend && pip install -r requirements.txt`
Expected: 모든 패키지 설치 성공 (에러 없이 종료)

- [ ] **Step 3: db.py 작성**

`backend/db.py`:

```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://scheduling:scheduling@localhost:5432/scheduling_optimizer",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: 테스트 작성 (SQLite 인메모리로 engine 생성 가능한지 확인)**

`backend/tests/test_db.py`:

```python
from sqlalchemy import create_engine
from db import Base


def test_base_metadata_creates_tables_on_sqlite():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    # 이 시점엔 모델이 없으니 테이블 0개가 정상
    assert engine.table_names() == []
```

- [ ] **Step 5: 테스트 실행**

Run: `cd backend && python -m pytest tests/test_db.py -v`
Expected: `1 passed`

- [ ] **Step 6: Alembic 초기화**

Run: `cd backend && python -m alembic init alembic`
Expected: `backend/alembic/` 디렉토리와 `backend/alembic.ini` 생성됨

- [ ] **Step 7: alembic.ini와 env.py를 프로젝트에 맞게 수정**

`backend/alembic.ini`에서 `sqlalchemy.url = ` 라인을 찾아 다음으로 교체 (빈 값으로 두고 env.py에서 환경변수로 주입):

```ini
sqlalchemy.url =
```

`backend/alembic/env.py`의 `target_metadata = None` 라인을 찾아 파일 상단 import 구문 아래에 다음을 추가하고 해당 라인을 교체:

```python
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from db import Base
import models  # noqa: F401  (모델을 import해야 Base.metadata에 테이블이 등록됨)

config.set_main_option(
    "sqlalchemy.url",
    os.environ.get(
        "DATABASE_URL",
        "postgresql://scheduling:scheduling@localhost:5432/scheduling_optimizer",
    ),
)

target_metadata = Base.metadata
```

(Task 2에서 `models.py`가 생성되므로, 이 import는 Task 2 완료 후에야 동작한다. 지금은 파일만 작성해 둔다.)

- [ ] **Step 8: 커밋**

```bash
cd ~/Downloads/scheduling-optimizer
git add backend/db.py backend/alembic.ini backend/alembic backend/requirements.txt backend/tests/test_db.py
git commit -m "feat: add SQLAlchemy db layer and Alembic setup"
```

---

### Task 2: ORM 모델 (Worker, Customer, LegacySyncLog) + 첫 마이그레이션

**Files:**
- Create: `backend/models.py`
- Create: `backend/alembic/versions/0001_initial.py`
- Test: `backend/tests/test_models_upsert.py`

**Interfaces:**
- Consumes: `db.Base` (Task 1)
- Produces: `models.Worker`, `models.Customer`, `models.LegacySyncLog` (SQLAlchemy ORM 클래스). 컬럼명은 [spec](../specs/2026-06-28-legacy-integration-design.md)의 DB 스키마 섹션과 동일.

- [ ] **Step 1: models.py 작성**

`backend/models.py`:

```python
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    func,
)

from db import Base


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
    source = Column(String)
    batch_date = Column(Date)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class LegacySyncLog(Base):
    __tablename__ = "legacy_sync_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_type = Column(String)
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))
    status = Column(String)
    records_processed = Column(Integer)
    error_message = Column(Text)
```

- [ ] **Step 2: 테스트 작성 — upsert(merge) 동작 확인**

`backend/tests/test_models_upsert.py`:

```python
from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db import Base
from models import Worker


def make_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_merge_inserts_new_worker():
    db = make_session()
    db.merge(Worker(id=1, name="김민준", region="A", batch_date=date(2026, 6, 28)))
    db.commit()

    worker = db.get(Worker, 1)
    assert worker.name == "김민준"


def test_merge_updates_existing_worker_by_id():
    db = make_session()
    db.merge(Worker(id=1, name="김민준", region="A"))
    db.commit()

    db.merge(Worker(id=1, name="김민준", region="B"))
    db.commit()

    workers = db.query(Worker).all()
    assert len(workers) == 1
    assert workers[0].region == "B"
```

- [ ] **Step 3: 테스트 실행**

Run: `cd backend && python -m pytest tests/test_models_upsert.py -v`
Expected: `2 passed`

- [ ] **Step 4: 첫 마이그레이션 생성**

Run:
```bash
cd backend
DATABASE_URL=postgresql://scheduling:scheduling@localhost:5432/scheduling_optimizer python -m alembic revision --autogenerate -m "initial tables"
```
Expected: `backend/alembic/versions/<hash>_initial_tables.py` 파일 생성됨 (로컬 docker-compose의 postgres가 떠 있어야 함: `docker compose up -d postgres`)

이 파일을 `backend/alembic/versions/0001_initial.py`로 이름을 바꾼다 (파일 안의 `revision =` 값은 그대로 둔다).

- [ ] **Step 5: 마이그레이션 적용 후 검증**

Run:
```bash
docker compose up -d postgres
cd backend
DATABASE_URL=postgresql://scheduling:scheduling@localhost:5432/scheduling_optimizer python -m alembic upgrade head
```
Expected: 에러 없이 완료. 이어서:

Run: `docker exec -it scheduling-optimizer-postgres-1 psql -U scheduling -d scheduling_optimizer -c '\dt'`
Expected: `workers`, `customers`, `legacy_sync_log`, `alembic_version` 4개 테이블이 보임

- [ ] **Step 6: 커밋**

```bash
cd ~/Downloads/scheduling-optimizer
git add backend/models.py backend/alembic/versions backend/tests/test_models_upsert.py
git commit -m "feat: add Worker/Customer/LegacySyncLog models and initial migration"
```

---

### Task 3: 레거시 API 클라이언트

**Files:**
- Create: `backend/legacy_client.py`
- Test: `backend/tests/test_legacy_client.py`

**Interfaces:**
- Produces: `legacy_client.LegacyClient` 클래스
  - `__init__(self, base_url: str, timeout: float = 10.0)`
  - `fetch_orders(self, batch_date: str) -> list[dict]` — 각 dict는 `id, name, x, y, svc, region, time_window, vip, overdue` 키를 가짐
  - `fetch_order(self, order_id: int) -> dict` — 단건 조회, 동일 키 구조
  - 5xx/타임아웃 시 최대 2회 재시도(총 3회 시도) 후 `legacy_client.LegacyClientError`를 raise

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_legacy_client.py`:

```python
import httpx
import pytest
import respx

from legacy_client import LegacyClient, LegacyClientError


@respx.mock
def test_fetch_orders_returns_list_of_dicts():
    respx.get("https://legacy.example.com/orders", params={"date": "2026-06-28"}).mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "id": 101,
                    "name": "고객A",
                    "x": 0.5,
                    "y": 0.5,
                    "svc": "internet",
                    "region": "A",
                    "time_window": "morning",
                    "vip": False,
                    "overdue": False,
                }
            ],
        )
    )
    client = LegacyClient(base_url="https://legacy.example.com")
    orders = client.fetch_orders("2026-06-28")

    assert len(orders) == 1
    assert orders[0]["id"] == 101


@respx.mock
def test_fetch_order_returns_single_dict():
    respx.get("https://legacy.example.com/orders/101").mock(
        return_value=httpx.Response(200, json={"id": 101, "name": "고객A"})
    )
    client = LegacyClient(base_url="https://legacy.example.com")
    order = client.fetch_order(101)

    assert order["id"] == 101


@respx.mock
def test_fetch_orders_retries_then_raises_on_persistent_500():
    route = respx.get("https://legacy.example.com/orders", params={"date": "2026-06-28"}).mock(
        return_value=httpx.Response(500)
    )
    client = LegacyClient(base_url="https://legacy.example.com")

    with pytest.raises(LegacyClientError):
        client.fetch_orders("2026-06-28")

    assert route.call_count == 3
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd backend && python -m pytest tests/test_legacy_client.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'legacy_client'`

- [ ] **Step 3: legacy_client.py 구현**

`backend/legacy_client.py`:

```python
import httpx


class LegacyClientError(Exception):
    pass


class LegacyClient:
    def __init__(self, base_url: str, timeout: float = 10.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _get(self, path: str, params: dict | None = None) -> dict | list:
        url = f"{self.base_url}{path}"
        last_error = None
        for attempt in range(3):
            try:
                response = httpx.get(url, params=params, timeout=self.timeout)
                if response.status_code >= 500:
                    last_error = LegacyClientError(
                        f"legacy server error {response.status_code} on {url}"
                    )
                    continue
                response.raise_for_status()
                return response.json()
            except httpx.TimeoutException as exc:
                last_error = LegacyClientError(f"timeout calling {url}: {exc}")
            except httpx.HTTPStatusError as exc:
                raise LegacyClientError(f"legacy client error: {exc}") from exc
        raise last_error

    def fetch_orders(self, batch_date: str) -> list[dict]:
        return self._get("/orders", params={"date": batch_date})

    def fetch_order(self, order_id: int) -> dict:
        return self._get(f"/orders/{order_id}")
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd backend && python -m pytest tests/test_legacy_client.py -v`
Expected: `3 passed`

- [ ] **Step 5: 커밋**

```bash
cd ~/Downloads/scheduling-optimizer
git add backend/legacy_client.py backend/tests/test_legacy_client.py
git commit -m "feat: add legacy API client with retry"
```

---

### Task 4: GET /workers, GET /customers 조회 엔드포인트

**Files:**
- Create: `backend/routers/__init__.py`
- Create: `backend/routers/data.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_data_router.py`
- Test: `backend/tests/conftest.py`

**Interfaces:**
- Consumes: `db.Base`, `db.get_db` (Task 1), `models.Worker`, `models.Customer` (Task 2)
- Produces: FastAPI `APIRouter` `data.router`, included in `main.app` — `GET /workers` → `list[WorkerOut]`, `GET /customers` → `list[CustomerOut]`

- [ ] **Step 1: 테스트 DB 픽스처 작성**

`backend/tests/conftest.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db import Base, get_db
from main import app


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine)
    session = TestSession()
    yield session
    session.close()


@pytest.fixture()
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
```

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/tests/test_data_router.py`:

```python
from models import Customer, Worker


def test_get_workers_returns_seeded_rows(client, db_session):
    db_session.add(Worker(id=1, name="김민준", region="A"))
    db_session.commit()

    response = client.get("/workers")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "김민준"


def test_get_customers_returns_seeded_rows(client, db_session):
    db_session.add(Customer(id=101, name="고객A", svc="internet"))
    db_session.commit()

    response = client.get("/customers")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["svc"] == "internet"
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd backend && python -m pytest tests/test_data_router.py -v`
Expected: FAIL (404, `/workers`가 아직 없음)

- [ ] **Step 4: routers/data.py 구현**

`backend/routers/__init__.py`: (빈 파일)

`backend/routers/data.py`:

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import get_db
from models import Customer, Worker

router = APIRouter()


class WorkerOut(BaseModel):
    id: int
    name: str
    x: float | None = None
    y: float | None = None
    color: str | None = None
    can_iptv: bool | None = None
    as_rate: float | None = None
    region: str | None = None

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

    class Config:
        from_attributes = True


@router.get("/workers", response_model=list[WorkerOut])
def get_workers(db: Session = Depends(get_db)):
    return db.query(Worker).all()


@router.get("/customers", response_model=list[CustomerOut])
def get_customers(db: Session = Depends(get_db)):
    return db.query(Customer).all()
```

- [ ] **Step 5: main.py에 라우터 연결**

`backend/main.py`의 `Instrumentator().instrument(app).expose(app, endpoint="/metrics")` 줄 바로 아래에 추가:

```python
from routers.data import router as data_router

app.include_router(data_router)
```

- [ ] **Step 6: 테스트 실행해서 통과 확인**

Run: `cd backend && python -m pytest tests/test_data_router.py -v`
Expected: `2 passed`

- [ ] **Step 7: 커밋**

```bash
cd ~/Downloads/scheduling-optimizer
git add backend/routers backend/main.py backend/tests/conftest.py backend/tests/test_data_router.py
git commit -m "feat: add GET /workers and GET /customers endpoints"
```

---

### Task 5: POST /legacy/orders/lookup 온디맨드 엔드포인트

**Files:**
- Create: `backend/routers/legacy.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_legacy_router.py`

**Interfaces:**
- Consumes: `legacy_client.LegacyClient`, `legacy_client.LegacyClientError` (Task 3), `models.Customer` (Task 2), `db.get_db` (Task 1)
- Produces: `POST /legacy/orders/lookup` — body `{"order_id": int}` → `200 {customer 필드}` 또는 `503`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_legacy_router.py`:

```python
from unittest.mock import patch

from legacy_client import LegacyClientError
from models import Customer


def test_lookup_upserts_and_returns_customer(client, db_session):
    fake_order = {
        "id": 555,
        "name": "고객B",
        "x": 0.3,
        "y": 0.4,
        "svc": "iptv",
        "region": "B",
        "time_window": "afternoon",
        "vip": True,
        "overdue": False,
    }
    with patch("routers.legacy.LegacyClient.fetch_order", return_value=fake_order):
        response = client.post("/legacy/orders/lookup", json={"order_id": 555})

    assert response.status_code == 200
    assert response.json()["name"] == "고객B"

    saved = db_session.get(Customer, 555)
    assert saved is not None
    assert saved.source == "ondemand"


def test_lookup_returns_503_when_legacy_unavailable(client, db_session):
    with patch(
        "routers.legacy.LegacyClient.fetch_order",
        side_effect=LegacyClientError("timeout"),
    ):
        response = client.post("/legacy/orders/lookup", json={"order_id": 999})

    assert response.status_code == 503
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd backend && python -m pytest tests/test_legacy_router.py -v`
Expected: FAIL (404, 라우트 없음)

- [ ] **Step 3: routers/legacy.py 구현**

`backend/routers/legacy.py`:

```python
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import get_db
from legacy_client import LegacyClient, LegacyClientError
from models import Customer

router = APIRouter(prefix="/legacy")

LEGACY_BASE_URL = os.environ.get("LEGACY_BASE_URL", "https://legacy.example.com")


class LookupRequest(BaseModel):
    order_id: int


@router.post("/orders/lookup")
def lookup_order(req: LookupRequest, db: Session = Depends(get_db)):
    client = LegacyClient(base_url=LEGACY_BASE_URL)
    try:
        order = client.fetch_order(req.order_id)
    except LegacyClientError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    customer = Customer(
        id=order["id"],
        name=order["name"],
        x=order.get("x"),
        y=order.get("y"),
        svc=order.get("svc"),
        region=order.get("region"),
        time_window=order.get("time_window"),
        vip=order.get("vip"),
        overdue=order.get("overdue"),
        source="ondemand",
    )
    db.merge(customer)
    db.commit()

    return order
```

- [ ] **Step 4: main.py에 라우터 연결**

`backend/main.py`의 `app.include_router(data_router)` 바로 아래에 추가:

```python
from routers.legacy import router as legacy_router

app.include_router(legacy_router)
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd backend && python -m pytest tests/test_legacy_router.py -v`
Expected: `2 passed`

- [ ] **Step 6: 커밋**

```bash
cd ~/Downloads/scheduling-optimizer
git add backend/routers/legacy.py backend/main.py backend/tests/test_legacy_router.py
git commit -m "feat: add on-demand legacy order lookup endpoint"
```

---

### Task 6: 작업자 CSV 파서

**Files:**
- Create: `backend/ingestion/__init__.py`
- Create: `backend/ingestion/csv_parser.py`
- Test: `backend/tests/test_csv_parser.py`
- Test fixture: `backend/tests/fixtures/workers_sample.csv`

**Interfaces:**
- Produces: `csv_parser.parse_workers_csv(path: str) -> list[dict]` — 각 dict 키: `id, name, x, y, color, can_iptv, as_rate, region`. 컬럼 누락/빈 파일은 빈 리스트 또는 부분 결과를 반환하고 예외를 던지지 않음(행 단위로 건너뛰고 경고만 누적).

- [ ] **Step 1: 샘플 CSV 픽스처 작성**

`backend/tests/fixtures/workers_sample.csv`:

```csv
id,name,x,y,color,can_iptv,as_rate,region
1,김민준,0.55,0.55,#4f6ef7,true,0.1,A
2,이서연,0.75,0.65,#22c55e,false,0.2,B
```

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/tests/test_csv_parser.py`:

```python
import os

from ingestion.csv_parser import parse_workers_csv

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def test_parse_workers_csv_returns_list_of_dicts():
    rows = parse_workers_csv(os.path.join(FIXTURE_DIR, "workers_sample.csv"))

    assert len(rows) == 2
    assert rows[0]["id"] == 1
    assert rows[0]["name"] == "김민준"
    assert rows[0]["can_iptv"] is True
    assert rows[1]["can_iptv"] is False


def test_parse_workers_csv_skips_row_with_invalid_id(tmp_path):
    bad_csv = tmp_path / "bad.csv"
    bad_csv.write_text(
        "id,name,x,y,color,can_iptv,as_rate,region\n"
        "not-a-number,깨진행,0,0,#000,true,0,A\n"
        "3,정상행,0.1,0.2,#111,true,0.05,A\n",
        encoding="utf-8",
    )

    rows = parse_workers_csv(str(bad_csv))

    assert len(rows) == 1
    assert rows[0]["id"] == 3
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd backend && python -m pytest tests/test_csv_parser.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingestion'`

- [ ] **Step 4: csv_parser.py 구현**

`backend/ingestion/__init__.py`: (빈 파일)

`backend/ingestion/csv_parser.py`:

```python
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
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd backend && python -m pytest tests/test_csv_parser.py -v`
Expected: `2 passed`

- [ ] **Step 6: 커밋**

```bash
cd ~/Downloads/scheduling-optimizer
git add backend/ingestion/__init__.py backend/ingestion/csv_parser.py backend/tests/test_csv_parser.py backend/tests/fixtures/workers_sample.csv
git commit -m "feat: add workers CSV parser"
```

---

### Task 7: 동기화 로그 헬퍼 + 배치 entrypoint (orders_batch, workers_batch)

**Files:**
- Create: `backend/ingestion/sync_log.py`
- Create: `backend/ingestion/orders_batch.py`
- Create: `backend/ingestion/workers_batch.py`
- Test: `backend/tests/test_sync_log.py`
- Test: `backend/tests/test_orders_batch.py`
- Test: `backend/tests/test_workers_batch.py`

**Interfaces:**
- Consumes: `db.SessionLocal` (Task 1), `models.Worker`, `models.Customer`, `models.LegacySyncLog` (Task 2), `legacy_client.LegacyClient` (Task 3), `ingestion.csv_parser.parse_workers_csv` (Task 6)
- Produces: `sync_log.sync_run(db, job_type)` (컨텍스트 매니저, `__enter__`에서 `LegacySyncLog` row 생성, `__exit__`에서 성공/실패와 처리 건수 기록 — `records` 속성에 건수를 set), `orders_batch.run(db, legacy_base_url, batch_date)`, `workers_batch.run(db, csv_dir)`

- [ ] **Step 1: sync_log 실패 테스트 작성**

`backend/tests/test_sync_log.py`:

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db import Base
from ingestion.sync_log import sync_run
from models import LegacySyncLog


def make_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_sync_run_records_success():
    db = make_session()
    with sync_run(db, "orders_batch") as ctx:
        ctx.records = 5

    log = db.query(LegacySyncLog).one()
    assert log.status == "success"
    assert log.records_processed == 5
    assert log.finished_at is not None


def test_sync_run_records_failure_and_reraises():
    db = make_session()
    try:
        with sync_run(db, "orders_batch") as ctx:
            ctx.records = 0
            raise RuntimeError("boom")
    except RuntimeError:
        pass

    log = db.query(LegacySyncLog).one()
    assert log.status == "failed"
    assert "boom" in log.error_message
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd backend && python -m pytest tests/test_sync_log.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingestion.sync_log'`

- [ ] **Step 3: sync_log.py 구현**

`backend/ingestion/sync_log.py`:

```python
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
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd backend && python -m pytest tests/test_sync_log.py -v`
Expected: `2 passed`

- [ ] **Step 5: orders_batch 실패 테스트 작성**

`backend/tests/test_orders_batch.py`:

```python
from unittest.mock import MagicMock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db import Base
from ingestion import orders_batch
from models import Customer, LegacySyncLog


def make_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_run_upserts_orders_and_logs_success():
    db = make_session()
    fake_client = MagicMock()
    fake_client.fetch_orders.return_value = [
        {
            "id": 1,
            "name": "고객A",
            "x": 0.1,
            "y": 0.2,
            "svc": "internet",
            "region": "A",
            "time_window": "morning",
            "vip": False,
            "overdue": False,
        }
    ]

    orders_batch.run(db, client=fake_client, batch_date="2026-06-28")

    customer = db.get(Customer, 1)
    assert customer.source == "batch"

    log = db.query(LegacySyncLog).one()
    assert log.status == "success"
    assert log.records_processed == 1
```

- [ ] **Step 6: 테스트 실행해서 실패 확인**

Run: `cd backend && python -m pytest tests/test_orders_batch.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingestion.orders_batch'`

- [ ] **Step 7: orders_batch.py 구현**

`backend/ingestion/orders_batch.py`:

```python
import os
from datetime import date

from db import SessionLocal
from ingestion.sync_log import sync_run
from legacy_client import LegacyClient
from models import Customer

LEGACY_BASE_URL = os.environ.get("LEGACY_BASE_URL", "https://legacy.example.com")


def run(db, client=None, batch_date: str | None = None):
    client = client or LegacyClient(base_url=LEGACY_BASE_URL)
    batch_date = batch_date or date.today().isoformat()

    with sync_run(db, "orders_batch") as ctx:
        orders = client.fetch_orders(batch_date)
        for order in orders:
            db.merge(
                Customer(
                    id=order["id"],
                    name=order["name"],
                    x=order.get("x"),
                    y=order.get("y"),
                    svc=order.get("svc"),
                    region=order.get("region"),
                    time_window=order.get("time_window"),
                    vip=order.get("vip"),
                    overdue=order.get("overdue"),
                    source="batch",
                    batch_date=date.fromisoformat(batch_date),
                )
            )
        db.commit()
        ctx.records = len(orders)


def main():
    db = SessionLocal()
    try:
        run(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 8: orders_batch 테스트 실행해서 통과 확인**

Run: `cd backend && python -m pytest tests/test_orders_batch.py -v`
Expected: `1 passed`

- [ ] **Step 9: workers_batch 실패 테스트 작성**

`backend/tests/test_workers_batch.py`:

```python
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db import Base
from ingestion import workers_batch
from models import LegacySyncLog, Worker

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def make_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_run_upserts_workers_from_csv_dir():
    db = make_session()

    workers_batch.run(db, csv_dir=FIXTURE_DIR, filename="workers_sample.csv")

    workers = db.query(Worker).order_by(Worker.id).all()
    assert len(workers) == 2
    assert workers[0].name == "김민준"

    log = db.query(LegacySyncLog).one()
    assert log.status == "success"
    assert log.records_processed == 2
```

- [ ] **Step 10: 테스트 실행해서 실패 확인**

Run: `cd backend && python -m pytest tests/test_workers_batch.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingestion.workers_batch'`

- [ ] **Step 11: workers_batch.py 구현**

`backend/ingestion/workers_batch.py`:

```python
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
        rows = parse_workers_csv(path)
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
```

- [ ] **Step 12: workers_batch 테스트 실행해서 통과 확인**

Run: `cd backend && python -m pytest tests/test_workers_batch.py -v`
Expected: `1 passed`

- [ ] **Step 13: 전체 테스트 스위트 한 번에 실행해서 회귀 확인**

Run: `cd backend && python -m pytest -v`
Expected: 모든 테스트 `passed` (Task 1~7에서 작성한 테스트 전체)

- [ ] **Step 14: 커밋**

```bash
cd ~/Downloads/scheduling-optimizer
git add backend/ingestion/sync_log.py backend/ingestion/orders_batch.py backend/ingestion/workers_batch.py backend/tests/test_sync_log.py backend/tests/test_orders_batch.py backend/tests/test_workers_batch.py
git commit -m "feat: add orders/workers daily batch entrypoints with sync logging"
```

---

### Task 8: ingestion 컨테이너 이미지 (로컬 빌드/실행까지, Azure 배포는 범위 밖)

**Files:**
- Create: `backend/ingestion/Dockerfile`
- Create: `backend/ingestion/entrypoint.sh`

**Interfaces:**
- Consumes: `backend/ingestion/orders_batch.py`, `backend/ingestion/workers_batch.py` (Task 7), `backend/requirements.txt` (Task 1)
- Produces: 로컬에서 `docker build`/`docker run`으로 배치를 1회 실행할 수 있는 이미지. Azure Container Apps Job 생성/배포는 다음 작업으로 분리 (사용자 지시).

- [ ] **Step 1: entrypoint.sh 작성**

`backend/ingestion/entrypoint.sh`:

```bash
#!/bin/sh
set -e
python -m ingestion.orders_batch
python -m ingestion.workers_batch
```

- [ ] **Step 2: Dockerfile 작성**

`backend/ingestion/Dockerfile`:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN chmod +x ingestion/entrypoint.sh
ENTRYPOINT ["ingestion/entrypoint.sh"]
```

(빌드 컨텍스트는 `backend/` 디렉토리 전체 — `docker build -f ingestion/Dockerfile .`를 `backend/`에서 실행)

- [ ] **Step 3: 로컬 이미지 빌드**

Run: `cd backend && docker build -f ingestion/Dockerfile -t scheduling-ingestion:local .`
Expected: 빌드 성공 (에러 없이 `Successfully tagged`)

- [ ] **Step 4: 로컬 postgres 기동 후 컨테이너 실행으로 동작 확인**

Run:
```bash
cd ~/Downloads/scheduling-optimizer
docker compose up -d postgres
docker run --rm \
  --network scheduling-optimizer_default \
  -e DATABASE_URL=postgresql://scheduling:scheduling@postgres:5432/scheduling_optimizer \
  -e LEGACY_BASE_URL=https://legacy.example.com \
  -v "$(pwd)/backend/tests/fixtures:/data/legacy/workers:ro" \
  -e WORKERS_CSV_DIR=/data/legacy/workers \
  -e WORKERS_CSV_FILENAME=workers_sample.csv \
  scheduling-ingestion:local
```
Expected: `orders_batch`는 `LEGACY_BASE_URL`이 실제로 존재하지 않아 `LegacyClientError`로 실패하며 0이 아닌 종료 코드를 반환할 수 있음 — 이는 정상이다 (실제 레거시 API가 아직 없기 때문). `workers_batch`가 실행되는지 확인하려면 `entrypoint.sh`에서 두 줄의 순서를 바꿔 임시로 검증하거나, 다음 Step에서 `legacy_sync_log` 테이블을 직접 조회해 `workers_batch`의 `status='success'` row가 있는지 확인한다.

Run: `docker exec -it scheduling-optimizer-postgres-1 psql -U scheduling -d scheduling_optimizer -c "SELECT job_type, status, records_processed FROM legacy_sync_log ORDER BY id;"`
Expected: 최소 `workers_batch` 1건이 `status`로 기록되어 있음 (실제 레거시 서버가 없으므로 `orders_batch`는 `failed`로 기록되는 것이 정상)

- [ ] **Step 5: 커밋**

```bash
cd ~/Downloads/scheduling-optimizer
git add backend/ingestion/Dockerfile backend/ingestion/entrypoint.sh
git commit -m "feat: add local-buildable Dockerfile for ingestion batch jobs"
```

---

## Self-Review 결과 (작성 시 점검)

- **Spec coverage**: 아키텍처/컴포넌트/DB스키마/데이터흐름/에러처리/테스트 섹션 모두 Task 1~8에서 다룸. "범위 밖" 항목(공유폴더 네트워크 연결, ca-ingestion CI/CD, 캐시 fallback, 스키마 정교화)은 의도적으로 포함하지 않음.
- **Placeholder scan**: 모든 단계에 실행 가능한 코드/명령을 포함. "TBD"/"적절히 처리" 같은 표현 없음.
- **Type consistency**: `models.Customer`/`models.Worker`의 필드명이 Task 4(라우터), Task 5(온디맨드), Task 7(배치) 전체에서 동일하게 사용됨. `sync_run` 컨텍스트의 `ctx.records` 속성명도 Task 7 전체에서 일관됨.

## 범위 밖 (이번 계획에 포함하지 않음)

- `ca-ingestion` Azure Container Apps Job 생성/배포, CI/CD 워크플로 (사용자 지시: 후속 작업)
- 공유 폴더의 실제 네트워크 연결 방식 (Azure Files vs VPN/ExpressRoute)
- 온디맨드 실패 시 캐시 fallback 정책
- `/optimize`가 DB 데이터를 직접 읽도록 바꾸는 것 (프론트엔드가 `GET /workers`/`GET /customers` 호출 후 body로 채워 넣는 흐름만 지원 — 프론트엔드 수정 자체도 이번 계획 범위 밖, 별도 계획 필요)
