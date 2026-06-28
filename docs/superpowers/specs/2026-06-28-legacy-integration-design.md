# 레거시 연동 설계 (작업자/주문 데이터 → DB)

## 배경

scheduling-optimizer의 backend는 현재 DB를 전혀 사용하지 않는다. `DATABASE_URL` 환경변수는 설정돼 있지만 `psycopg2`/`sqlalchemy`는 `requirements.txt`에 주석으로만 존재하고, `/optimize` 엔드포인트는 매 요청마다 프론트엔드(`dataGenerator.js`)가 만든 가짜 워커/고객 데이터를 body로 받아 처리한다.

다음 단계로, 레거시 시스템에서 실제 작업자/주문 데이터를 가져와 PostgreSQL에 적재하는 파이프라인을 구축한다. 레거시는 API(주문/실시간성 조회) 및 공유 폴더(CSV, 작업자 배치)를 통해 데이터를 제공할 수 있다.

## 요구사항 정리 (논의를 통해 확정)

- 대상 데이터: 고객/주문(Job) 데이터 + 작업자(기사) 데이터 둘 다
- 주문 데이터:
  - 일단위 배치: 우리가 레거시 API를 주기적으로 호출해 OR 엔진 대상 주문 목록을 가져옴 (pull)
  - 온디맨드: 실시간성이 필요한 특정 데이터는 그때그때 레거시 API에 질의해서 가져옴 (pull), 결과는 DB에 캐시/저장
  - MQ/웹훅 없음 — 레거시를 향한 호출은 전부 우리 쪽에서 Pull
- 작업자 데이터:
  - 일단위 배치
  - 레거시가 공유 폴더에 CSV 파일을 떨어뜨리는 구조
  - 공유 폴더가 Azure 내부(Azure File Share 등)인지 사내망(온프레미스)인지는 미정 — 코드는 경로 설정값만 바뀌면 동작하도록 추상화하고, 네트워크 연결 방식(Azure Files 직접 마운트 vs VPN Gateway/ExpressRoute)은 후속 결정으로 분리
- 스케줄링: Azure Container Apps Jobs(cron 트리거)를 사용해 배치를 별도 리소스로 분리. 기존 인프라가 전부 scale-to-zero(Consumption) 철학으로 일관되게 구축되어 있어, 상시 구동 프로세스(APScheduler 내장형) 대신 Job 방식을 선택
- CI/CD: 신규 `ca-ingestion` Container Apps Job은 이번 범위의 CI/CD 자동화에는 포함하지 않음 (수동 배포로 시작, 후속 작업에서 워크플로 추가)

## 아키텍처

```
[레거시 시스템]
   │ (API)                          │ (CSV 파일, 공유폴더)
   ▼                                 ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│ ca-scheduling-backend     │   │ ca-ingestion (신규,      │
│ (기존, 상시 API 서버)       │   │ Container Apps Job)     │
│                          │   │ - 매일 cron 트리거        │
│ + /legacy/* 온디맨드 API  │   │ - 주문 배치 (레거시 API)  │
│ + GET /workers           │   │ - 작업자 배치 (CSV)       │
│ + GET /customers         │   └──────────┬──────────────┘
└──────────┬───────────────┘              │
           ▼                              ▼
        ┌─────────────────────────────────────┐
        │   PostgreSQL (psql-scheduling-optimizer) │
        │   workers / customers / legacy_sync_log │
        └─────────────────────────────────────┘
```

배치(Job)와 실시간(backend API)이 같은 DB를 공유하지만 배포/실행 주기는 독립적이다.

## 컴포넌트

### 신규: `ca-ingestion` (Azure Container Apps Job)
- `orders_batch.py` — 레거시 주문 API 호출 → `customers` 테이블에 upsert (`source='batch'`)
- `workers_batch.py` — 공유 폴더(경로는 설정값/환경변수)의 CSV 읽기 → `workers` 테이블에 upsert
- cron 트리거로 매일 1회 실행, 끝나면 컨테이너 종료 (과금 없음)
- 이번 범위에서는 수동 배포 (`az containerapp job create`), CI/CD 워크플로는 후속 작업

### 기존 backend(`ca-scheduling-backend`) 변경
- `legacy_client.py` — 레거시 API 호출 공용 모듈 (인증, 재시도, 타임아웃)
- `POST /legacy/orders/lookup` — 온디맨드 조회, 레거시 API 동기 호출 → DB upsert(`source='ondemand'`) → 응답 반환
- `GET /workers`, `GET /customers` — DB에 적재된 실데이터 조회용 신규 엔드포인트. 프론트엔드는 `dataGenerator.js`로 가짜 데이터를 만드는 대신 이 엔드포인트를 호출해 `/optimize` 요청 body를 채움
- DB 액세스 레이어 추가 (SQLAlchemy) — `requirements.txt`의 주석 처리된 `psycopg2-binary`, `sqlalchemy`를 활성화
- `/optimize` 엔드포인트 자체는 요청 body로 워커/고객 목록을 받는 기존 방식을 그대로 유지 (호환성 유지, 기존 테스트/흐름을 깨지 않음)
- backend는 `backend/**` 경로 변경이므로 기존 [backend-deploy.yml](../../../.github/workflows/backend-deploy.yml) CI/CD가 그대로 자동 적용됨

## DB 스키마

```sql
-- 작업자 (배치로 적재, 매일 갱신)
CREATE TABLE workers (
  id            INTEGER PRIMARY KEY,        -- 레거시 작업자 ID
  name          TEXT NOT NULL,
  x             DOUBLE PRECISION,
  y             DOUBLE PRECISION,
  color         TEXT,
  can_iptv      BOOLEAN,
  as_rate       DOUBLE PRECISION,
  region        TEXT,
  source        TEXT DEFAULT 'legacy_csv',
  batch_date    DATE,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 고객/주문 (배치 + 온디맨드 모두 이 테이블에 upsert)
CREATE TABLE customers (
  id            INTEGER PRIMARY KEY,        -- 레거시 주문/고객 ID
  name          TEXT NOT NULL,
  x             DOUBLE PRECISION,
  y             DOUBLE PRECISION,
  svc           TEXT,                       -- internet / iptv / combo
  region        TEXT,
  time_window   TEXT,
  vip           BOOLEAN,
  overdue       BOOLEAN,
  source        TEXT,                       -- 'batch' | 'ondemand'
  batch_date    DATE,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 배치/온디맨드 실행 이력 (관측성, 디버깅용)
CREATE TABLE legacy_sync_log (
  id                 SERIAL PRIMARY KEY,
  job_type           TEXT,        -- 'orders_batch' | 'workers_batch' | 'ondemand'
  started_at         TIMESTAMPTZ,
  finished_at        TIMESTAMPTZ,
  status             TEXT,        -- 'success' | 'failed'
  records_processed  INTEGER,
  error_message      TEXT
);
```

- `id`는 레거시 고유 ID를 그대로 PK로 사용 → 재실행해도 `ON CONFLICT (id) DO UPDATE`로 안전하게 덮어씀 (멱등성)
- `legacy_sync_log`는 Grafana 대시보드에서 "배치 성공/실패 현황" 패널로 바로 연결 가능
- DB 마이그레이션은 Alembic으로 관리
- 스키마는 향후 변경될 가능성이 높아 우선 이 단순한 형태로 시작 (의도적으로 정교화하지 않음)

## 데이터 흐름

**주문 배치** (매일 1회)
1. `ca-ingestion` Job이 cron으로 기동
2. `legacy_client.fetch_orders(batch_date)` 호출 → 그날 OR 엔진 대상 주문 목록 수신
3. `customers` 테이블에 upsert (`source='batch'`)
4. `legacy_sync_log`에 결과 기록 후 컨테이너 종료

**작업자 배치** (매일 1회)
1. 같은 Job 실행 내에서 공유 폴더 경로 스캔
2. CSV 파싱 → `workers` 테이블에 upsert
3. `legacy_sync_log`에 기록

**온디맨드 조회** (필요할 때마다, 비정기)
1. 프론트엔드/OR 엔진이 backend의 `POST /legacy/orders/lookup` 호출
2. backend가 즉시 `legacy_client`로 레거시 API 동기 호출
3. 응답 데이터를 `customers` 테이블에 upsert (`source='ondemand'`)
4. 호출자에게 즉시 응답 반환 (DB 적재는 부가효과, 응답을 막지 않음)

**`/optimize` 연동**
- `/optimize`는 기존처럼 요청 body로 워커/고객 목록을 받는 방식 유지
- 프론트엔드는 `GET /workers`, `GET /customers`로 DB의 실데이터를 가져와 `/optimize` 요청 body를 채우는 흐름으로 전환

## 에러 처리 & 모니터링

- 배치 실패: `legacy_sync_log`에 `status='failed'` + 에러메시지 기록. Container Apps Job의 재시도 정책(`--replica-retry-limit`)으로 즉시 1~2회 재시도, 그래도 실패하면 다음날 배치까지 대기 (단순하게 시작)
- 온디맨드 호출 실패(레거시 다운/타임아웃): `503` 응답. 캐시 fallback(직전 DB 값을 stale로 표시해 반환할지) 정책은 후속 결정
- 모니터링: 기존 Grafana에 Postgres 데이터소스를 추가해 `legacy_sync_log` 기반 "배치 성공/실패" 패널 구성

## 테스트

- `legacy_client`: HTTP mock(`respx`/`responses`)으로 정상/타임아웃/4xx/5xx 케이스 단위 테스트
- CSV 파서: 샘플 CSV 파일로 정상/컬럼누락/빈파일 케이스 테스트
- 배치 잡: 로컬에서 entrypoint 스크립트 직접 실행 + 테스트용 DB(docker-compose의 postgres)로 통합 테스트
- `/optimize`는 동작 변경 없음 → 기존 테스트 그대로 유지

## 범위 밖 (후속 결정 사항)

- 공유 폴더 네트워크 연결 방식(Azure File Share 직접 마운트 vs VPN Gateway/ExpressRoute로 사내망 연결) — 레거시 측과 협의 후 결정
- `ca-ingestion`의 CI/CD 자동화 (이번 범위는 수동 배포)
- 온디맨드 호출 실패 시 캐시 fallback 정책
- DB 스키마 정교화 (관계, 인덱스, 추가 컬럼)
- **인증/인가 미적용 (의도적 결정)**: `POST /legacy/orders/lookup`, `GET /workers`, `GET /customers` 모두 인증 없이 호출 가능. 특히 `/legacy/orders/lookup`은 호출될 때마다 레거시로 아웃바운드 호출(최대 3회 재시도 × 10초 타임아웃)과 DB 쓰기를 트리거하므로, 실제 `LEGACY_BASE_URL`이 연결되는 시점에는 인증/레이트리밋 도입이 필요. 지금은 레거시 연결 자체가 placeholder라 낮은 리스크로 보류
- **배치 실행 중 프로세스가 강제 종료되는 경우**: `legacy_sync_log`에 `status='running'`인 채로 row가 영구히 남을 수 있음(정상적인 예외는 처리되지만 OOM/강제 종료 등은 캐치 불가). 후속 모니터링 작업(Grafana 패널)에서 "일정 시간 이상 running인 row는 stale로 간주" 같은 보정 로직 고려
