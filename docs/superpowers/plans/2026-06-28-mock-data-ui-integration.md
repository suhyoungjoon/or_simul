# 가상 데이터 기반 UI 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 레거시 시스템 연결 없이, DB에 시드한 가상 데이터로 프론트엔드가 `GET /workers`/`GET /customers`를 호출하도록 바꾸고, 온디맨드 주문 조회(`GET /legacy/orders/{order_id}`) 결과를 최적화 대상에 추가할 수 있는 UI를 만들어 실제 통합과 동일한 형태의 데모를 가능하게 한다.

**Architecture:** 백엔드는 기존 `customers`/`workers` 테이블 스키마를 그대로 쓰는 수동 1회 실행 시드 스크립트(`backend/scripts/seed_dummy_data.py`)와 `POST /legacy/orders/lookup` → `GET /legacy/orders/{order_id}` 경로 변경만 추가한다. 프론트엔드는 클라이언트 측 가짜 데이터 생성(`dataGenerator.js`의 `generateWorkers`/`generateCustomers`)을 제거하고 마운트 시 API 조회로 대체하며, 새 `OrderLookup.jsx` 탭에서 조회 결과를 기존 `customers` state에 merge해 `/optimize` 흐름에 자연스럽게 편입시킨다.

**Tech Stack:** FastAPI + SQLAlchemy (백엔드), React + Vite (프론트엔드), pytest (백엔드 테스트), 프론트엔드는 테스트 프레임워크 없음 — `npm run dev` 수동 검증.

## Global Constraints

- `/optimize` 엔드포인트와 그 요청/응답 스키마는 변경하지 않는다.
- 가상 데이터는 `workers`/`customers` 기존 테이블에 `source="mock"`으로 upsert한다 — 별도 테이블 신설 없음.
- 시드 스크립트는 수동 1회 실행만 지원한다 (`python -m backend.scripts.seed_dummy_data`). 백엔드 기동 시 자동 시드는 절대 추가하지 않는다.
- 시드 스크립트는 `DATABASE_URL` 환경변수만으로 로컬/Azure 어느 DB든 동작해야 한다 (특수 분기 없음).
- SidePanel의 "데모 데이터 생성" 섹션(고객수/작업자수 슬라이더)은 완전히 제거한다 — 줄이거나 숨기는 것이 아니라 삭제.
- `GET /legacy/orders/{order_id}`로의 경로/메서드 변경 시, 기존 핸들러 로직(레거시 호출 → `Customer` upsert(`source="ondemand"`) → malformed-response 503 가드 → 응답 반환, `LegacyClientError` 시 503)은 그대로 유지한다.
- 프론트엔드에는 테스트 프레임워크가 없다 (기존 관례) — 모든 프론트엔드 변경은 `npm run dev`로 수동 검증한다.
- `dataGenerator.js`의 `SVC_LABEL`, `SVC_TIME`은 `MapCanvas.jsx`/`Timeline.jsx`/`App.jsx`가 계속 사용하므로 삭제하지 않는다.

---

### Task 1: 온디맨드 조회 엔드포인트를 GET으로 변경

**Files:**
- Modify: `backend/routers/legacy.py`
- Modify: `backend/tests/test_legacy_router.py`

**Interfaces:**
- Consumes: `legacy_client.LegacyClient`, `legacy_client.LegacyClientError` (변경 없음), `models.Customer` (변경 없음), `db.get_db` (변경 없음)
- Produces: `GET /legacy/orders/{order_id}` — Task 6(`OrderLookup.jsx`)이 이 경로/메서드로 fetch한다. 응답 바디는 레거시 주문 dict 그대로(기존과 동일), 실패 시 503.

- [ ] **Step 1: 실패하는 테스트로 먼저 변경**

`backend/tests/test_legacy_router.py` 전체를 다음으로 교체:

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
        response = client.get("/legacy/orders/555")

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
        response = client.get("/legacy/orders/999")

    assert response.status_code == 503
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd backend && source venv/bin/activate && python -m pytest tests/test_legacy_router.py -v`
Expected: FAIL — `405 Method Not Allowed` (라우트가 아직 POST이므로 GET이 거부됨)

- [ ] **Step 3: `backend/routers/legacy.py`를 GET 경로로 수정**

전체 파일을 다음으로 교체:

```python
import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from legacy_client import LegacyClient, LegacyClientError
from models import Customer

router = APIRouter(prefix="/legacy")

LEGACY_BASE_URL = os.environ.get("LEGACY_BASE_URL", "https://legacy.example.com")


@router.get("/orders/{order_id}")
def lookup_order(order_id: int, db: Session = Depends(get_db)):
    client = LegacyClient(base_url=LEGACY_BASE_URL)
    try:
        order = client.fetch_order(order_id)
    except LegacyClientError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if "id" not in order or "name" not in order:
        raise HTTPException(
            status_code=503, detail="legacy response missing required fields"
        )

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

`LookupRequest` 모델과 `pydantic.BaseModel` import는 더는 쓰이지 않으므로 제거했다 (위 코드에 이미 반영됨).

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd backend && source venv/bin/activate && python -m pytest tests/test_legacy_router.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: 전체 백엔드 테스트 스위트 회귀 확인**

Run: `cd backend && source venv/bin/activate && python -m pytest -v`
Expected: PASS — 기존 16개 + 변경된 2개 모두 통과, 신규 실패 없음

- [ ] **Step 6: 커밋**

```bash
git add backend/routers/legacy.py backend/tests/test_legacy_router.py
git commit -m "refactor: change order lookup from POST body to GET path param"
```

---

### Task 2: 가상 데이터 시드 스크립트 작성

**Files:**
- Create: `backend/scripts/__init__.py` (빈 파일, 패키지화)
- Create: `backend/scripts/seed_dummy_data.py`
- Test: `backend/tests/test_seed_dummy_data.py`

**Interfaces:**
- Consumes: `db.get_engine_and_session` 패턴은 없음 — `db.py`가 노출하는 것은 `Base`, `get_db`(FastAPI dependency)뿐이므로, 스크립트는 `sqlalchemy.create_engine(os.environ["DATABASE_URL"])` + `sqlalchemy.orm.Session`을 직접 사용한다. `models.Worker`, `models.Customer`를 import해 사용.
- Produces: `seed_dummy_data.build_workers() -> list[dict]`, `seed_dummy_data.build_customers() -> list[dict]`, `seed_dummy_data.seed(session) -> None` — 이 3개 함수가 테스트와 `__main__` 양쪽에서 재사용된다.

먼저 `backend/db.py`를 확인해 정확한 연결 패턴을 따른다:

- [ ] **Step 1: `backend/db.py` 확인**

Run: `cat backend/db.py`

이미 알려진 내용 기준으로(이전 작업에서 구현됨): `DATABASE_URL = os.environ["DATABASE_URL"]`, `engine = create_engine(DATABASE_URL)`, `SessionLocal = sessionmaker(...)`, `Base = declarative_base()`, `get_db()` generator. 스크립트는 이 `engine`/`SessionLocal`을 그대로 import해서 재사용한다 (중복 연결 로직 작성 금지).

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/tests/test_seed_dummy_data.py`:

```python
from scripts.seed_dummy_data import build_customers, build_workers, seed
from models import Customer, Worker


def test_build_workers_returns_five_fixed_workers():
    workers = build_workers()
    assert len(workers) == 5
    assert {w["id"] for w in workers} == {1, 2, 3, 4, 5}
    assert all(w["name"] for w in workers)
    assert all(0.0 <= w["x"] <= 1.0 and 0.0 <= w["y"] <= 1.0 for w in workers)


def test_build_customers_returns_twenty_fixed_customers():
    customers = build_customers()
    assert len(customers) == 20
    assert {c["id"] for c in customers} == set(range(1, 21))
    assert all(c["svc"] in {"internet", "iptv", "combo"} for c in customers)


def test_seed_upserts_into_db_with_mock_source(db_session):
    seed(db_session)

    workers = db_session.query(Worker).all()
    customers = db_session.query(Customer).all()
    assert len(workers) == 5
    assert len(customers) == 20
    assert all(w.source == "mock" for w in workers)
    assert all(c.source == "mock" for c in customers)


def test_seed_is_idempotent(db_session):
    seed(db_session)
    seed(db_session)

    assert db_session.query(Worker).count() == 5
    assert db_session.query(Customer).count() == 20
```

`db_session` fixture는 `backend/tests/conftest.py`에 이미 존재하는 것을 재사용한다 (SQLite in-memory).

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd backend && source venv/bin/activate && python -m pytest tests/test_seed_dummy_data.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'scripts'`

- [ ] **Step 4: `backend/scripts/__init__.py` 빈 파일 생성**

Run: `touch backend/scripts/__init__.py`

- [ ] **Step 5: `backend/scripts/seed_dummy_data.py` 작성**

`frontend/src/utils/dataGenerator.js`의 로직을 결정론적 ID/고정 시드로 포팅한다 (랜덤이지만 매 실행 동일 결과가 나오도록 `random.seed`로 고정 — 멱등성 보장):

```python
"""수동 1회 실행 가상 데이터 시드 스크립트.

사용법: python -m scripts.seed_dummy_data
DATABASE_URL 환경변수가 가리키는 DB(로컬 또는 Azure)에 시드한다.
"""
import math
import random

from db import SessionLocal
from models import Customer, Worker

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


def seed(session) -> None:
    for w in build_workers():
        session.merge(Worker(**w, source="mock"))
    for c in build_customers():
        session.merge(Customer(**c, source="mock"))
    session.commit()


if __name__ == "__main__":
    session = SessionLocal()
    try:
        seed(session)
        print(f"시드 완료: workers={WORKER_COUNT}, customers={CUSTOMER_COUNT}")
    finally:
        session.close()
```

- [ ] **Step 6: 테스트 실행해서 통과 확인**

Run: `cd backend && source venv/bin/activate && python -m pytest tests/test_seed_dummy_data.py -v`
Expected: PASS (4 passed)

- [ ] **Step 7: 로컬 DB에 실제 1회 실행해서 검증**

Run:
```bash
cd backend
source venv/bin/activate
docker compose up -d postgres   # 로컬 postgres가 안 떠 있으면
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/scheduling_optimizer"  # 실제 conftest/docker-compose 값 확인 후 맞춰서 실행
python -m scripts.seed_dummy_data
```
Expected: `시드 완료: workers=5, customers=20` 출력, 에러 없음

- [ ] **Step 8: 전체 백엔드 테스트 스위트 회귀 확인**

Run: `cd backend && source venv/bin/activate && python -m pytest -v`
Expected: PASS — 전부 통과

- [ ] **Step 9: 커밋**

```bash
git add backend/scripts/__init__.py backend/scripts/seed_dummy_data.py backend/tests/test_seed_dummy_data.py
git commit -m "feat: add manual seed script for mock workers/customers data"
```

---

### Task 3: Azure PostgreSQL에 가상 데이터 시드 실행 (운영 작업, 코드 변경 없음)

**Files:** 없음 (운영 명령 실행만)

**Interfaces:** Task 2의 `python -m scripts.seed_dummy_data`를 재사용.

- [ ] **Step 1: Azure PostgreSQL `DATABASE_URL` 확인**

Run: `az containerapp show --name ca-scheduling-backend --resource-group rg-scheduling-optimizer --query "properties.template.containers[0].env" -o json`

여기서 `DATABASE_URL` 값(또는 그 secret 참조)을 확인한다. secret이면: `az containerapp secret show --name ca-scheduling-backend --resource-group rg-scheduling-optimizer --secret-name <secret-name>`로 평문 값을 확인한다.

- [ ] **Step 2: Azure PostgreSQL 방화벽이 현재 클라이언트 IP를 허용하는지 확인**

`infra/AZURE_SETUP_LOG.md`에 기록된 대로 현재 방화벽 규칙은 `0.0.0.0-255.255.255.255` (전체 허용)이므로 별도 조치 불필요. (CLAUDE.md의 "운영 전 좁혀야 함" 항목은 이 작업의 범위 밖.)

- [ ] **Step 3: 로컬에서 Azure DB를 타겟으로 시드 스크립트 실행**

```bash
cd backend
source venv/bin/activate
export DATABASE_URL="<Step 1에서 확인한 Azure PostgreSQL 연결 문자열>"
python -m scripts.seed_dummy_data
```
Expected: `시드 완료: workers=5, customers=20` 출력

- [ ] **Step 4: 배포된 백엔드 API로 시드 결과 확인**

Run: `curl -s https://ca-scheduling-backend.<도메인>/workers | python3 -m json.tool | head -20` (정확한 FQDN은 `az containerapp show ... --query properties.configuration.ingress.fqdn` 로 확인)

Expected: 5개 worker JSON 배열 응답

- [ ] **Step 5: `infra/AZURE_SETUP_LOG.md`에 기록 후 커밋**

이번 작업은 코드 변경이 아니라 운영 작업이므로, 로그 파일에 "Azure PostgreSQL에 가상 데이터(workers 5건, customers 20건, source=mock) 시드 완료" 항목을 날짜와 함께 추가하고 커밋한다 (CLAUDE.md에 명시된 Azure 변경 로깅 규칙).

```bash
git add infra/AZURE_SETUP_LOG.md
git commit -m "docs: log mock data seed into Azure PostgreSQL"
```

---

### Task 4: `dataGenerator.js`에서 가짜 데이터 생성 함수 제거

**Files:**
- Modify: `frontend/src/utils/dataGenerator.js`

**Interfaces:**
- Produces: `SVC_LABEL`, `SVC_TIME`만 남는다 (다른 파일들이 계속 import). `generateWorkers`, `generateCustomers`, `WORKER_NAMES`, `WORKER_COLORS`는 제거되어 더는 export되지 않음 — Task 5가 이 제거를 전제로 `App.jsx`를 수정한다.

- [ ] **Step 1: 사용처 재확인 (회귀 방지)**

Run: `cd frontend && grep -rn "generateWorkers\|generateCustomers\|WORKER_NAMES\|WORKER_COLORS" src/`
Expected: `dataGenerator.js`(정의)와 `App.jsx`(사용) 외에는 나오지 않음 — Task 5에서 `App.jsx`의 사용도 제거되므로 이 작업 순서가 맞음.

- [ ] **Step 2: `frontend/src/utils/dataGenerator.js`를 다음으로 교체**

```javascript
export const SVC_LABEL = { internet:'인터넷', iptv:'IPTV', combo:'결합' };
export const SVC_TIME  = { internet:60, iptv:90, combo:150 };
```

- [ ] **Step 3: 프론트엔드 빌드로 즉시 에러 확인 (App.jsx는 아직 미수정이므로 에러 나는 게 정상)**

Run: `cd frontend && npm run build`
Expected: FAIL — `generateWorkers`/`generateCustomers` is not exported (App.jsx가 Task 5에서 고쳐질 때까지는 의도된 실패)

- [ ] **Step 4: 커밋 (App.jsx 수정과 함께 묶지 않고 별도 커밋 — 다음 Task에서 빌드가 다시 통과함을 확인)**

```bash
git add frontend/src/utils/dataGenerator.js
git commit -m "refactor: remove client-side fake data generators from dataGenerator.js"
```

---

### Task 5: `App.jsx`를 API 조회 기반으로 전환 + 주문 조회 탭 연결

**Files:**
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `GET /workers` → `WorkerOut[]`, `GET /customers` → `CustomerOut[]` (Task 1 이전부터 이미 존재하는 백엔드 엔드포인트, 변경 없음). `OrderLookup` 컴포넌트(Task 6에서 생성) — `<OrderLookup onAddToOptimization={fn} />` 형태로 마운트.
- Produces: `customers` state에 `mergeCustomer(customer)` 콜백 — Task 6의 `OrderLookup.jsx`가 "최적화 대상에 추가" 클릭 시 호출.

- [ ] **Step 1: `App.jsx` 상단 import와 state 초기화 부분 수정**

기존:
```javascript
import { useState } from "react";
import SidePanel from "./components/SidePanel";
import MapCanvas from "./components/MapCanvas";
import Timeline  from "./components/Timeline";
import { generateWorkers, generateCustomers, SVC_LABEL } from "./utils/dataGenerator";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const TABS = [
  { id:"map",      label:"🗺 지도 뷰" },
  { id:"timeline", label:"📅 타임라인" },
  { id:"table",    label:"📋 배정 목록" },
  { id:"log",      label:"🔧 최적화 로그" },
];

export default function App() {
  const [tab,         setTab]         = useState("map");
  const [loading,     setLoading]     = useState(false);
  const [result,      setResult]      = useState(null);
  const [workers,     setWorkers]     = useState([]);
  const [customers,   setCustomers]   = useState([]);
  const [error,       setError]       = useState(null);

  async function handleOptimize(cfg) {
    setLoading(true); setError(null);

    const ws = generateWorkers(cfg.workerCount);
    const cs = generateCustomers(cfg.custCount, cfg.region, cfg.svc);
    setWorkers(ws); setCustomers(cs);

    try {
```

다음으로 교체:
```javascript
import { useState, useEffect } from "react";
import SidePanel from "./components/SidePanel";
import MapCanvas from "./components/MapCanvas";
import Timeline  from "./components/Timeline";
import OrderLookup from "./components/OrderLookup";
import { SVC_LABEL } from "./utils/dataGenerator";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const TABS = [
  { id:"map",      label:"🗺 지도 뷰" },
  { id:"timeline", label:"📅 타임라인" },
  { id:"table",    label:"📋 배정 목록" },
  { id:"log",      label:"🔧 최적화 로그" },
  { id:"lookup",   label:"🔍 주문 조회" },
];

export default function App() {
  const [tab,         setTab]         = useState("map");
  const [loading,     setLoading]     = useState(false);
  const [result,      setResult]      = useState(null);
  const [workers,     setWorkers]     = useState([]);
  const [customers,   setCustomers]   = useState([]);
  const [error,       setError]       = useState(null);
  const [dataLoaded,  setDataLoaded]  = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [wRes, cRes] = await Promise.all([
          fetch(`${API}/workers`),
          fetch(`${API}/customers`),
        ]);
        if (!wRes.ok || !cRes.ok) throw new Error("초기 데이터 조회 실패");
        setWorkers(await wRes.json());
        setCustomers(await cRes.json());
      } catch (e) {
        setError(e.message);
      } finally {
        setDataLoaded(true);
      }
    }
    loadData();
  }, []);

  function mergeCustomer(customer) {
    setCustomers(prev => {
      const idx = prev.findIndex(c => c.id === customer.id);
      if (idx === -1) return [...prev, customer];
      const next = [...prev];
      next[idx] = customer;
      return next;
    });
  }

  async function handleOptimize(cfg) {
    setLoading(true); setError(null);

    try {
```

- [ ] **Step 2: `handleOptimize` 내부에서 `ws`/`cs` 참조를 state로 교체**

기존 `fetch` 블록 내부:
```javascript
        body: JSON.stringify({
          workers: ws,
          customers: cs,
          constraints: {
```

다음으로 교체:
```javascript
        body: JSON.stringify({
          workers: workers,
          customers: customers,
          constraints: {
```

- [ ] **Step 3: 빈 상태 안내 문구를 "시드 스크립트 안내"로 보강**

기존:
```javascript
          {!result && !loading && (
            <div style={{textAlign:"center",padding:"80px 20px",color:"#5a6085"}}>
              <div style={{fontSize:36,marginBottom:10,opacity:.5}}>📡</div>
              <div style={{fontSize:13}}>왼쪽에서 조건을 설정하고<br/><strong style={{color:"#4f6ef7"}}>최적화 실행</strong>을 눌러주세요</div>
            </div>
          )}
```

다음으로 교체:
```javascript
          {!result && !loading && (
            <div style={{textAlign:"center",padding:"80px 20px",color:"#5a6085"}}>
              <div style={{fontSize:36,marginBottom:10,opacity:.5}}>📡</div>
              {dataLoaded && workers.length === 0 && customers.length === 0 ? (
                <div style={{fontSize:13}}>
                  표시할 데이터가 없습니다.<br/>
                  <code>python -m scripts.seed_dummy_data</code>를 먼저 실행하세요
                </div>
              ) : (
                <div style={{fontSize:13}}>왼쪽에서 조건을 설정하고<br/><strong style={{color:"#4f6ef7"}}>최적화 실행</strong>을 눌러주세요</div>
              )}
            </div>
          )}
```

- [ ] **Step 4: 탭 콘텐츠 영역에 `lookup` 탭 추가**

기존:
```javascript
              {tab === "map"      && <MapCanvas workers={workers} customers={customers} assignments={assignments} />}
              {tab === "timeline" && <Timeline  workers={workers} customers={customers} assignments={assignments} />}
              {tab === "table"    && <AssignTable workers={workers} customers={customers} assignments={assignments} />}
              {tab === "log"      && <LogView logs={logs} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

다음으로 교체 (lookup 탭은 `result` 유무와 무관하게 항상 보이도록 `result && !loading` 블록 밖으로 빼야 함 — 아래 Step 5 참고):
```javascript
              {tab === "map"      && <MapCanvas workers={workers} customers={customers} assignments={assignments} />}
              {tab === "timeline" && <Timeline  workers={workers} customers={customers} assignments={assignments} />}
              {tab === "table"    && <AssignTable workers={workers} customers={customers} assignments={assignments} />}
              {tab === "log"      && <LogView logs={logs} />}
            </>
          )}
          {tab === "lookup" && <OrderLookup apiBase={API} onAddToOptimization={mergeCustomer} />}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 프론트엔드 개발 서버로 수동 검증**

Run:
```bash
cd backend && source venv/bin/activate && uvicorn main:app --reload &
cd frontend && npm run dev
```

브라우저에서 `http://localhost:5173` 접속:
- 시드를 먼저 실행한 상태라면 "🔍 주문 조회" 탭을 눌렀을 때 화면이 보이는지 확인 (다른 탭은 `result` 없으면 빈 상태 안내만 보임 — lookup은 항상 접근 가능해야 함)
- "최적화 실행" 클릭 → 정상적으로 결과가 나오는지 확인 (시드된 5 workers / 20 customers 기준)

Expected: 콘솔 에러 없음, "최적화 실행" 정상 동작

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/App.jsx
git commit -m "feat: fetch workers/customers from API instead of generating client-side"
```

---

### Task 6: SidePanel에서 "데모 데이터 생성" 섹션 제거

**Files:**
- Modify: `frontend/src/components/SidePanel.jsx`

**Interfaces:** 없음 (출력 props `onOptimize(cfg)`의 `cfg` shape에서 `custCount`/`workerCount` 키가 빠짐 — `App.jsx`의 `handleOptimize`는 Task 5에서 이미 이 두 키를 참조하지 않도록 수정됨).

- [ ] **Step 1: `cfg` 초기 state에서 `custCount`/`workerCount` 제거**

기존:
```javascript
  const [cfg, setCfg] = useState({
    date: "2025-06-27",
    region: "all",
    svc: "all",
    maxJobs: 6,
    routeWeight: 3,
    balanceWeight: 3,
    vip: true,
    as: true,
    overdue: false,
    custCount: 20,
    workerCount: 5,
  });
```

다음으로 교체:
```javascript
  const [cfg, setCfg] = useState({
    date: "2025-06-27",
    region: "all",
    svc: "all",
    maxJobs: 6,
    routeWeight: 3,
    balanceWeight: 3,
    vip: true,
    as: true,
    overdue: false,
  });
```

- [ ] **Step 2: "데모 데이터 생성" `Section` 블록 전체 제거**

다음 블록을 삭제:
```javascript
      {/* 데이터 생성 */}
      <Section title="데모 데이터 생성">
        <RangeField label="고객 수" min={10} max={40} value={cfg.custCount}
          onChange={v=>set("custCount",v)} />
        <RangeField label="작업자 수" min={3} max={8} value={cfg.workerCount}
          onChange={v=>set("workerCount",v)} />
      </Section>
```

- [ ] **Step 3: 프론트엔드 개발 서버로 수동 검증**

Run: `cd frontend && npm run dev` (이미 떠 있으면 핫리로드로 충분)

브라우저에서 SidePanel을 확인: "데모 데이터 생성" 섹션이 더는 보이지 않고, "기본 설정"/"최적화 조건" 섹션과 "최적화 실행" 버튼은 정상 동작.

Expected: 콘솔 에러 없음, "최적화 실행" 클릭 시 여전히 정상 동작 (시드된 workers/customers 기준)

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/SidePanel.jsx
git commit -m "refactor: remove demo data generation sliders from SidePanel"
```

---

### Task 7: `OrderLookup.jsx` 신규 컴포넌트 작성

**Files:**
- Create: `frontend/src/components/OrderLookup.jsx`

**Interfaces:**
- Consumes: props `{ apiBase: string, onAddToOptimization: (customer) => void }` (Task 5의 `App.jsx`가 `apiBase={API}`, `onAddToOptimization={mergeCustomer}`로 전달).
- Produces: `GET {apiBase}/legacy/orders/{order_id}` 호출 (Task 1에서 변경된 경로/메서드와 정확히 일치해야 함).

- [ ] **Step 1: `frontend/src/components/OrderLookup.jsx` 작성**

```javascript
import { useState } from "react";

const SVC_LABEL = { internet:'인터넷', iptv:'IPTV', combo:'결합' };

export default function OrderLookup({ apiBase, onAddToOptimization }) {
  const [orderId, setOrderId] = useState("");
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [added,   setAdded]   = useState(false);

  async function handleLookup() {
    if (!orderId.trim()) return;
    setLoading(true); setError(null); setResult(null); setAdded(false);
    try {
      const res = await fetch(`${apiBase}/legacy/orders/${encodeURIComponent(orderId.trim())}`);
      if (!res.ok) throw new Error(`조회 실패 (${res.status})`);
      setResult(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleAdd() {
    if (!result) return;
    onAddToOptimization(result);
    setAdded(true);
  }

  const inputStyle = {
    background:"#232636", border:"1px solid #2e3250", color:"#e8eaf6",
    padding:"8px 10px", borderRadius:6, fontSize:13, flex:1,
  };
  const btnStyle = {
    padding:"8px 16px", background:"#4f6ef7", color:"#fff", border:"none",
    borderRadius:6, fontSize:13, fontWeight:600, cursor:"pointer",
  };

  return (
    <div style={{maxWidth:480}}>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <input
          style={inputStyle}
          placeholder="주문 ID 입력"
          value={orderId}
          onChange={e=>setOrderId(e.target.value)}
          onKeyDown={e=>{ if (e.key === "Enter") handleLookup(); }}
        />
        <button style={btnStyle} onClick={handleLookup} disabled={loading}>
          {loading ? "조회 중..." : "조회"}
        </button>
      </div>

      {error && (
        <div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",
          borderRadius:8,padding:"10px 14px",color:"#ef4444",fontSize:12,marginBottom:12}}>
          ⚠️ {error}
        </div>
      )}

      {result && (
        <div style={{background:"#1a1d27",border:"1px solid #2e3250",borderRadius:10,padding:16}}>
          <div style={{fontSize:14,fontWeight:600,marginBottom:8}}>{result.name}{result.vip ? " ⭐" : ""}</div>
          <div style={{fontSize:12,color:"#8b91b5",lineHeight:1.6}}>
            <div>주문 ID: {result.id}</div>
            <div>서비스: {SVC_LABEL[result.svc] || result.svc}</div>
            <div>구역: {result.region}</div>
            <div>희망 시간대: {result.time_window === "morning" ? "오전" : "오후"}</div>
            <div>연체 여부: {result.overdue ? "예" : "아니오"}</div>
          </div>
          <button
            style={{...btnStyle, marginTop:12, width:"100%",
              background: added ? "#22c55e" : "#4f6ef7"}}
            onClick={handleAdd}
            disabled={added}
          >
            {added ? "✓ 추가됨" : "최적화 대상에 추가"}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 프론트엔드 개발 서버로 수동 검증 (전체 시나리오)**

Run: 백엔드/프론트엔드 모두 기동 중인 상태에서 브라우저로:
1. "🔍 주문 조회" 탭 클릭
2. 존재하지 않는 order_id(예: `99999`) 입력 → 조회 → 에러 메시지가 카드 영역에 표시되는지 확인 (전체 화면은 정상 유지)
3. `LEGACY_BASE_URL`이 placeholder이므로 실제로는 모든 조회가 503이 날 수 있음 — 이 경우 "백엔드가 레거시 연결 없이도 에러를 깔끔하게 보여주는지"만 확인하면 충분 (레거시 연동 자체는 이번 작업 범위 밖)
4. 에러 메시지 표시 후 다른 탭(지도뷰 등)으로 이동해도 정상 동작하는지 확인

Expected: 콘솔 에러 없음, 에러가 나도 전체 앱이 깨지지 않음

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/OrderLookup.jsx
git commit -m "feat: add OrderLookup component for on-demand order search"
```

---

### Task 8: 전체 통합 수동 검증 + 문서 갱신

**Files:**
- Modify: `CLAUDE.md` (진행 상황 갱신)

**Interfaces:** 없음 (검증 + 문서화 작업).

- [ ] **Step 1: 백엔드 테스트 스위트 최종 회귀 확인**

Run: `cd backend && source venv/bin/activate && python -m pytest -v`
Expected: 전부 PASS (기존 16개 + Task 1에서 수정된 2개 + Task 2의 4개 = 최소 20개)

- [ ] **Step 2: 로컬 DB 시드 + 풀 데모 시나리오 수동 검증**

```bash
cd backend && source venv/bin/activate
docker compose up -d postgres
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/scheduling_optimizer"
python -m scripts.seed_dummy_data
uvicorn main:app --reload &
cd ../frontend && npm run dev
```

브라우저에서:
1. 앱 로드 시 에러 없이 데이터가 준비된 상태인지 확인 (빈 상태 안내가 "시드 실행하세요"로 안 뜨면 정상)
2. "최적화 실행" → 시드된 5 workers/20 customers 기준으로 정상 배정되는지 확인 (지도뷰/타임라인/배정목록/로그 탭 모두 확인)
3. "🔍 주문 조회" 탭에서 조회 시도 (레거시 미연결이라 503 예상 — 에러 표시만 확인)
4. 모든 탭 전환이 에러 없이 동작하는지 확인

Expected: 전체 시나리오에서 콘솔 에러 없음, 기존 기능(최적화 실행) 회귀 없음

- [ ] **Step 3: `CLAUDE.md`의 "진행 중/완료된 주요 작업" 섹션에 항목 추가**

5번 항목으로 다음을 추가:
```markdown
5. **가상 데이터 기반 UI 연동 (레거시 미연결 상태에서 데모 가능)** — 완료
   - 설계: [docs/superpowers/specs/2026-06-28-mock-data-ui-integration-design.md](docs/superpowers/specs/2026-06-28-mock-data-ui-integration-design.md)
   - 계획: [docs/superpowers/plans/2026-06-28-mock-data-ui-integration.md](docs/superpowers/plans/2026-06-28-mock-data-ui-integration.md)
   - 추가된 것: `backend/scripts/seed_dummy_data.py`(수동 1회 시드, source="mock"), `GET /legacy/orders/{order_id}`로 경로 변경(기존 POST 폐기), 프론트엔드는 `GET /workers`/`GET /customers`로 전환(클라이언트 가짜 데이터 생성 제거), SidePanel 데모 데이터 슬라이더 제거, 신규 `OrderLookup.jsx`(🔍 주문 조회 탭)로 온디맨드 조회 결과를 최적화 대상에 추가 가능
```

"알려진 보류/후속 작업"의 "프론트엔드가 아직 dataGenerator.js로 가짜 데이터를 생성" 항목은 제거한다 (해결됨).

- [ ] **Step 4: 커밋**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with mock-data UI integration completion"
```
