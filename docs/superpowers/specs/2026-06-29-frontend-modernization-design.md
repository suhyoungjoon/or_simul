# 프론트엔드 아키텍처 개편 설계

## 배경

현재 프론트엔드(`frontend/`)는 React 18 + Vite로 동작하지만, 모든 스타일이 인라인 `style={{...}}` 객체로 직접 작성되어 있고, 상태관리는 `App.jsx`의 `useState`에 전부 의존하며, 지도뷰는 0~1 정규화 좌표를 `<canvas>`에 직접 그리는 방식이다. 기능이 늘어날수록(작업자 필터, 온디맨드 조회 추적 등) `App.jsx`가 비대해지고 prop drilling이 심해지고 있다.

이번 작업은 (1) 스타일 시스템을 Tailwind CSS + shadcn/ui로 교체하고 디자인 자체도 갱신, (2) 상태관리를 Zustand 단일 스토어로 통합, (3) 지도뷰를 가상 정규화 좌표 캔버스에서 react-leaflet 기반 실제 지도(서울 실제 위경도 + 가상 동/도로명 주소)로 전환하는, 세 갈래를 한 번에 진행하는 전체 일괄 전환이다. `/optimize` 엔드포인트의 요청/응답 스키마는 변경하지 않는다.

## 요구사항 정리 (논의를 통해 확정)

- **범위**: 전체 일괄 전환 (화면은 그대로 두고 내부만 바꾸는 것이 아니라, 룩앤필도 shadcn 컴포넌트 스타일을 적극 활용해 새로 디자인)
- **지도 정밀도**: 구역 단위 근사를 넘어서, 각 구역(A/B/C)에 대응하는 서울 실제 동 이름 + 가상 도로명까지 포함한 텍스트 주소를 생성하고, 실제 위경도로 지도에 표시
- **상태관리 범위**: Zustand 스토어에 워커/고객/결과/선택된 작업자/온디맨드 조회 목록뿐 아니라 SidePanel의 `cfg`(설정값)까지 전부 통합
- **지도 타일**: CartoDB Dark Matter (무료, API 키 불필요, 기존 다크 테마와 어울림)
- **마커 방식**: Leaflet 기본 아이콘 대신 `<CircleMarker>` 사용 (Vite+Leaflet의 기본 아이콘 경로 깨짐 이슈 회피, 기존 캔버스 점 마커와 시각적으로도 더 가까움)
- 작업 브랜치: `claude/frontend-modernization` (새 브랜치)

## 아키텍처

```
[backend/scripts/seed_dummy_data.py]
   │ address(가상 동/도로명) + lat/lng(실제 서울 위경도) 추가 생성
   ▼
[workers/customers/legacy_orders 테이블] (address, lat, lng 컬럼 추가)
   │
   ▼
[GET /workers, GET /customers, GET /legacy/orders/{id}] (응답에 address/lat/lng 포함)
   │
   ▼
[Zustand store.js] ← 모든 컴포넌트가 구독
   │         (workers, customers, optimizedCustomers, result,
   │          selectedWorkerId, lookupAddedIds, cfg, loading, error)
   ▼
[App.jsx (레이아웃만)] → [SidePanel] [MapView(react-leaflet)] [AssignTable] [Timeline] [OrderLookup]
                              └─ 전부 Tailwind + shadcn/ui 컴포넌트로 재작성
```

`/optimize`는 기존처럼 요청 body로 워커/고객 목록을 받는 방식 그대로 유지 — 이 개편의 영향을 받지 않는다.

## 컴포넌트

### 백엔드 (지도 정밀도를 위해 필요한 최소 변경)

- **`backend/models.py`**: `Worker`, `Customer`, `LegacyOrder`에 `address`(String), `lat`(Float), `lng`(Float) 컬럼 추가. 기존 `x`/`y`(정규화 캔버스 좌표)는 그대로 유지 — 이번 개편 후에도 구버전 클라이언트나 다른 용도로 참조될 수 있어 제거하지 않음
- **Alembic 마이그레이션**: `add address/lat/lng columns` 신규 리비전
- **`backend/scripts/seed_dummy_data.py`**: 구역(A/B/C)별 실제 서울 동 이름 풀 추가
  - A(강남/서초) → ["역삼동", "반포동", "서초동", "논현동"]
  - B(송파/강동) → ["잠실동", "천호동", "성내동"]
  - C(마포/서대문) → ["연남동", "신촌동", "북아현동"]
  - 각 동에 대해 대략적인 실제 위경도 범위(중심점 + 반경)를 하드코딩하고, 그 범위 내에서 랜덤 위경도 생성. 가상 도로명은 `f"{동이름} {랜덤숫자}길 {랜덤숫자}"` 형태로 생성
  - `build_workers()`, `build_customers()`, `build_legacy_orders()` 모두 `address`, `lat`, `lng` 필드 추가
- **`backend/routers/data.py`**: `WorkerOut`/`CustomerOut`에 `address: str | None`, `lat: float | None`, `lng: float | None` 필드 추가
- **`backend/routers/legacy.py`**: 응답 dict에 `address`/`lat`/`lng` 추가

### 프론트엔드

- **`frontend/package.json`**: `tailwindcss`, `zustand`, `react-leaflet`, `leaflet` 의존성 추가, shadcn CLI로 `components/ui/*` 생성
- **`frontend/src/store.js`** (신규): Zustand 스토어
  - State: `workers, customers, optimizedCustomers, result, selectedWorkerId, lookupAddedIds, cfg, loading, error, dataLoaded`
  - Actions: `loadInitialData()`, `mergeCustomer(customer)`, `runOptimize()`, `setSelectedWorker(id)`, `updateCfg(partial)`
- **`frontend/src/components/MapView.jsx`** (신규, `MapCanvas.jsx` 대체): `<MapContainer>` + CartoDB Dark Matter `<TileLayer>`. 워커/고객은 `<CircleMarker>`, 클릭 시 `<Popup>`에 이름/주소/서비스/구역 표시. 작업자 동선은 `<Polyline>`. 구역 표시는 `<Circle>`(점선 스타일)로 유지
- **`frontend/src/components/ui/*`** (신규): shadcn 표준 컴포넌트 — Button, Card, Badge, Select, Slider, Switch, Tabs, Input
- **`frontend/src/components/SidePanel.jsx`** (재작성): Zustand `cfg`/`updateCfg` 구독, shadcn Select/Slider/Switch로 교체
- **`frontend/src/components/AssignTable.jsx`** (신규 분리, `App.jsx`에서 추출): Zustand 구독, Tailwind 테이블 스타일, "구역" 컬럼에 `address` 표시
- **`frontend/src/components/OrderLookup.jsx`** (재작성): Zustand `mergeCustomer` 액션 사용, shadcn Input/Button/Card로 교체, 결과 카드에 `address` 표시
- **`frontend/src/components/WorkerFilterList.jsx`** (신규 분리): Zustand `selectedWorkerId`/`setSelectedWorker` 구독
- **`frontend/src/App.jsx`** (대폭 축소): Tailwind 레이아웃 클래스, 탭 전환 상태(`tab`)만 로컬 `useState`로 유지(전역 공유 불필요), 나머지는 각 컴포넌트가 스토어 직접 구독

## 데이터 흐름

**초기 로딩**: `App.jsx` 마운트 → `store.loadInitialData()` 액션이 `GET /workers`/`GET /customers` 호출 → 응답(주소/위경도 포함)을 스토어에 저장

**최적화 실행**: SidePanel의 모든 입력 필드가 `store.cfg`에 직접 바인딩(`updateCfg`) → "최적화 실행" 클릭 → `store.runOptimize()`가 `cfg.region`/`cfg.svc`로 고객 필터링 → `/optimize` 호출(기존 스키마 그대로) → `result`/`optimizedCustomers` 저장

**지도 표시**: `MapView.jsx`가 스토어의 `customers`/`workers`(`lat`/`lng` 포함)를 구독해 Leaflet 마커 렌더링. 마커 클릭 시 팝업에 `address` 표시

**작업자 필터**: `WorkerFilterList.jsx`에서 작업자 클릭 → `store.setSelectedWorker(id)` → `MapView`/`AssignTable`/`Timeline`이 공통으로 스토어의 파생 값(`displayAssignments`, `displayCustomers`, `displayWorkers` — 스토어 내부 selector 또는 각 컴포넌트의 계산)을 통해 필터링된 결과만 표시

**온디맨드 조회**: 기존과 동일하게 `GET /legacy/orders/{id}`(응답에 `address`/`lat`/`lng` 포함) → "최적화 대상에 추가" → `store.mergeCustomer()` 호출 → `lookupAddedIds`에 추가되어 결과 화면에서 배지로 표시(기존 동작 유지)

## 에러 처리

- **Leaflet 마커 아이콘 깨짐 회피**: 기본 `L.Icon` 대신 `<CircleMarker>`(SVG 원, 색상 직접 지정) 사용 — Vite 환경에서 Leaflet 기본 아이콘 이미지 경로가 깨지는 흔한 문제를 구조적으로 회피
- **타일 로딩 실패**: CartoDB 타일 서버 장애 시 Leaflet의 기본 동작(빈 회색 타일)을 그대로 둠 — 데모용 도구라 별도 폴백/재시도 로직은 과도한 엔지니어링으로 보고 범위에서 제외
- 기존 에러 처리 패턴(초기 로딩 실패 시 배너, 온디맨드 조회 실패 시 카드 내부 에러)은 그대로 유지하되 `store.error` 상태로 관리

## 테스트

- **백엔드**: 기존 pytest 패턴 유지. `seed_dummy_data.py`에 추가되는 `address`/`lat`/`lng` 필드 생성 검증 테스트, `routers/data.py`/`routers/legacy.py` 응답 스키마에 새 필드가 포함되는지 검증하는 테스트 추가
- **프론트엔드**: 기존 관례대로 테스트 프레임워크 없음 — `npm run dev`로 수동 검증
  - 초기 로딩 시 지도에 위경도 기반 마커가 정상 표시되는지
  - 최적화 실행 → 결과가 지도/타임라인/배정목록에 반영되는지
  - 마커 클릭 → 가상 주소가 포함된 팝업이 뜨는지
  - 작업자 필터 선택/해제가 지도·테이블 모두에 일관되게 반영되는지
  - 온디맨드 조회 → 추가 → 배지 표시까지 기존 흐름이 깨지지 않는지
  - SidePanel의 모든 입력(날짜/구역/서비스/슬라이더/토글)이 스토어에 정상 반영되는지

## 범위 밖 (이번 계획에 포함하지 않음)

- `/optimize` 엔드포인트의 요청/응답 스키마 변경
- 실제 지오코딩 API 연동 (가상 동/도로명 + 하드코딩된 위경도 범위로 충분 — 실주소 검증 불필요)
- 모바일 반응형 레이아웃 최적화 (현재도 고정 데스크톱 레이아웃, 이번 개편에서도 유지)
- 백엔드 인증/레이트리밋 (기존에도 없었고 이번 범위에도 포함 안 함)
- E2E/컴포넌트 테스트 프레임워크 도입 (프로젝트 전체 관례상 보류)
