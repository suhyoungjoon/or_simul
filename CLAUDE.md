# scheduling-optimizer 프로젝트 컨텍스트

인터넷/IPTV 설치 작업자 배정 최적화 웹 앱. 이 파일은 세션 시작 시 자동으로 읽히는 "현재 상태 허브" 문서입니다 — 세부 내역은 아래 링크된 문서를 참고하세요.

## 아키텍처 개요

```
[레거시 시스템] --(API/CSV)--> [ca-ingestion(예정)/온디맨드 API] --> PostgreSQL <-- [ca-scheduling-backend] <-- [Static Web App(frontend)]
                                                                          │
                                                          [ca-prometheus / ca-loki / ca-grafana] (모니터링)
```

- **Backend**: FastAPI (`backend/main.py`), 스코어링 기반 배정 알고리즘(추후 OR-Tools VRPTW 교체 예정)
- **Frontend**: React + Vite (`frontend/`), 지도뷰·타임라인·배정목록·최적화 로그 탭
- **배포**: Azure Container Apps(backend, 모니터링) + Azure Static Web Apps(frontend) + Azure Database for PostgreSQL
- **CI/CD**: GitHub Actions (`.github/workflows/`) — `backend/**`, `frontend/**` 변경 시 자동 빌드/배포
- **모니터링**: Prometheus + Grafana + Loki/Promtail (Azure Container Apps Environment 내부)
- **저장소**: GitHub `suhyoungjoon/or_simul`, 기본/유일 브랜치 `claude/scheduling-optimizer-setup-wcrh8t` (`main` 브랜치 없음)

## 현재 배포된 Azure 리소스

전체 이력과 명령어는 [infra/AZURE_SETUP_LOG.md](infra/AZURE_SETUP_LOG.md) 참고. 요약:

| 리소스 | 이름 | 리전 |
|---|---|---|
| Resource Group | `rg-scheduling-optimizer` | koreacentral |
| Container Registry | `acrschedulingopt.azurecr.io` | koreacentral |
| PostgreSQL Flexible Server | `psql-scheduling-optimizer` | koreacentral |
| Container Apps Environment | `env-scheduling-optimizer` | koreacentral |
| Container App (backend + promtail 사이드카) | `ca-scheduling-backend` | koreacentral |
| Container App (Prometheus, internal) | `ca-prometheus` | koreacentral |
| Container App (Loki, internal) | `ca-loki` | koreacentral |
| Container App (Grafana, external) | `ca-grafana` | koreacentral |
| Static Web App (frontend) | `swa-scheduling-optimizer` | eastasia |

Grafana 접속: https://ca-grafana.ambitiousdune-51dd5b07.koreacentral.azurecontainerapps.io (admin / 비밀번호는 로컬 `.env`의 `GRAFANA_ADMIN_PASSWORD`)

## 진행 중 / 완료된 주요 작업

1. **기본 인프라 구축** — ACR, PostgreSQL, Container Apps, Static Web App 배포 완료
2. **모니터링 구축** — Prometheus + Grafana + Loki/Promtail, 기본 대시보드("Scheduling Backend Overview") 프로비저닝 완료
3. **CI/CD 구축** — GitHub Actions로 backend/frontend 자동 배포 완료
4. **레거시 연동 (DB 처음 도입)** — 설계 스펙·구현 계획·8개 Task 구현+리뷰 모두 완료
   - 설계: [docs/superpowers/specs/2026-06-28-legacy-integration-design.md](docs/superpowers/specs/2026-06-28-legacy-integration-design.md)
   - 계획: [docs/superpowers/plans/2026-06-28-legacy-integration.md](docs/superpowers/plans/2026-06-28-legacy-integration.md)
   - 추가된 것: SQLAlchemy DB 계층, `Worker`/`Customer`/`LegacySyncLog` 모델, 레거시 API 클라이언트(재시도 포함), `GET /workers`/`GET /customers`, 온디맨드 조회 `POST /legacy/orders/lookup`, 작업자 CSV 배치 파서, 일배치 entrypoint(`backend/ingestion/`), 로컬 빌드 가능한 ingestion Docker 이미지
   - 테스트: `cd backend && source venv/bin/activate && python -m pytest -v` (16개, 전부 통과)
5. **가상 데이터 기반 UI 연동 (레거시 미연결 상태에서 데모 가능)** — 완료
   - 설계: [docs/superpowers/specs/2026-06-28-mock-data-ui-integration-design.md](docs/superpowers/specs/2026-06-28-mock-data-ui-integration-design.md)
   - 계획: [docs/superpowers/plans/2026-06-28-mock-data-ui-integration.md](docs/superpowers/plans/2026-06-28-mock-data-ui-integration.md)
   - 추가된 것: `backend/scripts/seed_dummy_data.py`(수동 1회 시드, `source="mock"`, 로컬/Azure DB 모두 시드 완료), `GET /legacy/orders/{order_id}`로 경로 변경(기존 `POST /legacy/orders/lookup` 폐기), 프론트엔드는 `GET /workers`/`GET /customers`로 전환(클라이언트 가짜 데이터 생성 제거), SidePanel 데모 데이터 슬라이더 제거, 신규 `OrderLookup.jsx`(🔍 주문 조회 탭)로 온디맨드 조회 결과를 최적화 대상에 추가 가능
   - 테스트: 백엔드 20개 전부 통과, 프론트엔드는 실제 브라우저(preview) 수동 검증 완료 — 초기 데이터 로딩, 최적화 실행(배정률 100%), 주문 조회 탭 에러 처리(전체 화면 영향 없음) 확인
   - 발견된 이슈: 레거시 연결 실패 시 백엔드가 503이 아닌 500을 반환하는 기존 버그(`backend/legacy_client.py`) 발견 — 별도 후속 작업으로 분리(`task_8cf1ced4`), 프론트엔드는 `!res.ok`로 상태코드 무관하게 동일하게 처리하므로 이번 작업 범위에는 영향 없음

## 알려진 보류/후속 작업 (의도적으로 범위 밖으로 둔 것)

- `ca-ingestion` Azure Container Apps Job 실제 배포 + CI/CD 자동화 (현재는 로컬 빌드/실행 검증까지만)
- `legacy_client.py`가 레거시 연결 실패 시 503 대신 500을 반환하는 버그 (httpx.ConnectError가 LegacyClientError로 변환되지 않음, FastAPI 기본 500 핸들러가 CORS 헤더를 안 붙여 브라우저에서 "Failed to fetch"로 보임)
- `GET /legacy/orders/{order_id}`, `GET /workers`, `GET /customers`에 인증/레이트리밋 없음
- 공유 폴더(작업자 CSV) 네트워크 연결 방식(Azure Files vs VPN/ExpressRoute) 미결정
- PostgreSQL 방화벽이 전체 IP 허용 상태 (운영 전 좁혀야 함)
- Grafana 데이터(Prometheus/Loki)는 ephemeral storage — 재시작 시 유실
- Grafana admin 비밀번호가 `admin1234`로 고정됨(사용자 요청), 외부 공개 URL이라 운영 전 강화 필요

## 로컬 개발

```bash
docker compose up -d postgres        # 로컬 PostgreSQL
cd backend && source venv/bin/activate  # Python 3.11 venv (psycopg2 호환 때문에 3.13 불가)
python -m pytest -v                  # 테스트
cd ../frontend && npm install && npm run dev
```

## 작업 방식 관련 메모

- Azure 리소스를 생성/변경할 때마다 [infra/AZURE_SETUP_LOG.md](infra/AZURE_SETUP_LOG.md)에 날짜/명령/결과를 기록하고 커밋하는 규칙을 따른다 (사용자가 반복 강조한 요구사항)
- 새 기능은 `superpowers:brainstorming` → `writing-plans` → `subagent-driven-development` 순서로 진행 (설계 승인 후 구현)
