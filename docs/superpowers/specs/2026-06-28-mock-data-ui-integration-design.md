# 가상 데이터 기반 UI 연동 설계 (목업 데이터 + 온디맨드 조회)

## 배경

레거시 연동([2026-06-28-legacy-integration-design.md](2026-06-28-legacy-integration-design.md))은 백엔드 기능만 구현되어 있고(`GET /workers`, `GET /customers`, 온디맨드 조회 엔드포인트), 실제 레거시 시스템은 아직 연결되지 않았다. 프론트엔드는 여전히 `dataGenerator.js`로 클라이언트에서 즉석으로 가짜 데이터를 만들어 `/optimize`에 보내는 구조다.

이번 작업은 실제 레거시 연결 없이도, DB에 가상 데이터를 채워두고 프론트엔드가 새 API를 호출하도록 바꿔서 실제 통합과 동일한 형태로 UI 개발/시연이 가능하게 만든다. 추가로, 온디맨드 조회로 가져온 특정 주문을 최적화 대상에 끼워넣어 작업자를 배정받는 기능도 포함한다.

## 요구사항 정리 (논의를 통해 확정)

- 가상 데이터는 `workers`/`customers` 테이블에 직접 INSERT/UPSERT하는 **시드 스크립트**로 생성한다 (별도 가상 테이블 없음 — 기존 스키마 그대로 사용, `source="mock"`으로 구분)
- 시드 스크립트는 **수동 1회 실행** (`python -m backend.scripts.seed_dummy_data`), 백엔드 기동 시 자동 시드는 하지 않음
- 시드 대상은 **로컬 개발 DB와 배포된 Azure PostgreSQL 둘 다** (`DATABASE_URL` 환경변수로 타겟 지정, 기존 관례 그대로)
- 프론트엔드는 `dataGenerator.js`의 `generateWorkers`/`generateCustomers`를 제거하고 `GET /workers`/`GET /customers` API 호출로 완전히 교체한다 (폴백 없음)
- SidePanel의 "데모 데이터 생성" 섹션(고객수/작업자수 슬라이더)은 제거한다 — 데이터 개수는 시드 스크립트가 정한 만큼 고정
- `/optimize` 엔드포인트와 그 요청/응답 스키마는 변경하지 않는다
- **온디맨드 조회 API 경로 변경**: `POST /legacy/orders/lookup` (body) → `GET /legacy/orders/{order_id}` (path parameter)로 변경. 멱등성 있는 조회 작업이라 RESTful 관례에 맞춤
- 온디맨드로 조회한 주문은 별도 UI(`🔍 주문 조회` 탭)에서 검색하고, "최적화 대상에 추가" 버튼으로 현재 `customers` state에 merge한 뒤, 기존 "최적화 실행" 버튼으로 배정한다 (`/optimize` 자체는 변경 없음 — 프론트엔드 상태 관리만으로 구현)

## 아키텍처

```
backend/scripts/seed_dummy_data.py  (수동 1회 실행, 로컬 또는 Azure DATABASE_URL 지정)
            │ INSERT/UPSERT (source="mock")
            ▼
   workers / customers 테이블 (기존 스키마 그대로)
            │
            ▼ (앱 마운트 시 1회 조회)
GET /workers, GET /customers  (기존 엔드포인트, 변경 없음)
            │
            ▼
   App.jsx — useEffect로 마운트 시 fetch, state에 저장
            │
            ▼
   "최적화 실행" 클릭 → 그 state 그대로 /optimize에 전송 (기존 흐름 동일)

[별도 흐름]
🔍 주문 조회 탭 → GET /legacy/orders/{order_id} → 결과 카드
            │ "최적화 대상에 추가" 클릭
            ▼
   customers state에 merge → 이후 "최적화 실행" 클릭 시 함께 배정
```

핵심: `/optimize`, DB 스키마, 기존 백엔드 엔드포인트 로직은 전혀 안 바꾼다. 바뀌는 건 (a) 시드 스크립트 신규 추가, (b) 온디맨드 조회 엔드포인트의 HTTP 메서드/경로, (c) 프론트엔드가 데이터를 "생성"하지 않고 "조회"하도록 변경, (d) 온디맨드 조회 UI 신규 추가.

## 컴포넌트

### 백엔드

- **`backend/routers/legacy.py` (수정)**: `POST /legacy/orders/lookup` → `GET /legacy/orders/{order_id}`로 변경. 핸들러 로직(레거시 호출 → `Customer` upsert(`source="ondemand"`) → 응답 반환, `LegacyClientError` 시 503)은 동일하게 유지
- **`backend/tests/test_legacy_router.py` (수정)**: 새 경로(`GET`, path parameter)에 맞게 두 테스트 케이스(정상 조회+upsert 확인, 레거시 실패 시 503) 수정
- **`backend/scripts/seed_dummy_data.py` (신규)**: 기존 `dataGenerator.js`의 워커/고객 생성 로직(이름 풀, 색상 풀, 구역별 좌표 분포, 서비스 유형 분포)을 파이썬으로 포팅. 결정론적 ID(예: worker 1~5, customer 1~20)로 `db.merge()` upsert해서 재실행 안전(멱등). `source="mock"`으로 표시. `DATABASE_URL` 환경변수로 타겟 DB 결정 (기존 `db.py`의 관례 그대로, 별도 설정 불필요)

### 프론트엔드

- **`App.jsx` (수정)**:
  - 마운트 시 `useEffect`로 `GET /workers`, `GET /customers` 호출 → `workers`/`customers` state 초기화
  - `generateWorkers`/`generateCustomers` 호출 제거, import 제거
  - 신규 상태: `lookupResult`(조회된 주문), "최적화 대상에 추가" 클릭 시 `customers` state에 id 기준으로 merge(있으면 교체, 없으면 추가)
  - `TABS`에 `🔍 주문 조회` 탭 추가
- **`SidePanel.jsx` (수정)**: "데모 데이터 생성" `Section`(고객수/작업자수 `RangeField` 2개) 제거. `cfg` state에서 `custCount`/`workerCount` 제거
- **`OrderLookup.jsx` (신규 컴포넌트)**: order_id 입력 필드 + 조회 버튼 + 결과 카드(주문 정보 표시) + "최적화 대상에 추가" 버튼. 조회 실패 시 카드 영역에만 에러 표시
- **`dataGenerator.js` (수정)**: `generateWorkers`, `generateCustomers`, `WORKER_NAMES`, `WORKER_COLORS` export 제거 (시드 스크립트로 로직 이전, 더는 프론트엔드에서 안 씀). `SVC_LABEL`, `SVC_TIME`은 `MapCanvas.jsx`/`Timeline.jsx`/`App.jsx`가 계속 사용하므로 유지

## 데이터 흐름

**초기 로딩**
1. `App.jsx` 마운트 → `GET /workers`, `GET /customers` 동시 호출 → `workers`/`customers` state 설정
2. 시드 스크립트를 미리 실행하지 않았으면 빈 배열 응답 → 화면에 "시드 스크립트를 먼저 실행하세요" 안내 표시 (기존 "조건 설정 후 최적화 실행" 빈 상태 화면을 확장)

**최적화 실행** (기존과 동일, 변경 없음)
- "최적화 실행" 클릭 → 현재 state의 `workers`/`customers`를 그대로 `/optimize`에 전송

**온디맨드 조회 → 최적화 대상 추가** (신규)
1. `🔍 주문 조회` 탭에서 order_id 입력 → `GET /legacy/orders/{id}` 호출
2. 응답을 카드로 표시 (또는 에러 표시)
3. "최적화 대상에 추가" 클릭 → `customers` state에 merge (같은 id면 교체, 없으면 추가)
4. 사용자가 "최적화 실행" 클릭 → 이 고객도 포함해서 배정 (기존 `/optimize` 흐름 그대로 재사용)

## 에러 처리

- 초기 로딩 시 `GET /workers`/`GET /customers` 실패(백엔드 다운 등) → 기존 에러 배너 재사용 ("백엔드 서버가 실행 중인지 확인하세요")
- 온디맨드 조회 실패(레거시 다운 → 503, 또는 없는 order_id) → 검색 결과 영역에만 에러 메시지 표시, 전체 화면 동작에는 영향 없음

## 테스트

- 백엔드: `test_legacy_router.py`를 `GET /legacy/orders/{order_id}` 기준으로 수정해서 기존 2개 케이스(정상 조회+upsert, 레거시 실패 시 503) 유지
- 시드 스크립트: 생성되는 데이터 개수/형식을 확인하는 단위 테스트 + 로컬 DB에 실제 1회 실행해서 검증
- 프론트엔드: 이 프로젝트에는 별도 테스트 프레임워크가 없음(기존 관례) → `npm run dev`로 직접 동작 확인 (초기 로딩, 온디맨드 조회 추가, 최적화 실행까지 수동 시나리오)

## 범위 밖 (이번 계획에 포함하지 않음)

- 백엔드 기동 시 자동 시드 (수동 1회 실행만 지원)
- 배정 목록/타임라인의 각 항목에 "실시간 갱신" 버튼 추가 (별도 검색 UI로만 온디맨드 조회 제공)
- 가상 데이터(`source="mock"`)와 실제 레거시 데이터의 운영 DB 내 정리/분리 정책 (Azure DB에도 가상 데이터를 시드하기로 했으므로, 추후 실제 레거시 연동 시 `source="mock"` row를 어떻게 정리할지는 후속 결정 필요)
