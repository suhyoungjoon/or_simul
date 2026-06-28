# Azure 인프라 구축 로그

## 리소스 요약 (업데이트 예정)

| 리소스 | 이름 | 리전 | SKU/Tier | 상태 |
|---|---|---|---|---|
| Resource Group | rg-scheduling-optimizer | koreacentral | - | 생성됨 |
| Container Registry | acrschedulingopt (acrschedulingopt.azurecr.io) | koreacentral | Basic | 생성됨 |
| PostgreSQL Flexible Server | psql-scheduling-optimizer (psql-scheduling-optimizer.postgres.database.azure.com) | koreacentral | Burstable B1ms, 32GiB, v16 | 생성됨 |
| Container Apps Environment | env-scheduling-optimizer | koreacentral | Consumption | 생성됨 |
| Container App (backend) | ca-scheduling-backend | koreacentral | 0.25vCPU/0.5GiB, min0/max1 | 생성됨, Running |
| Static Web App (frontend) | swa-scheduling-optimizer | eastasia | Free | 생성됨, 배포 완료 |

---

## 작업 기록

### 2026-06-28
- **Azure CLI 설치**: Homebrew로 `azure-cli` 2.87.0 설치 완료 (`brew install azure-cli`)
- **az login**: 브라우저 인증으로 로그인 완료. 계정: tjdudwns@gmail.com
  - 구독 2개 확인됨: `Pay-As-You-Go` (56d01583-7b34-4be7-84c5-477e86bfdb18), `종량제` (3d01b9a5-0f1e-46b1-b98e-ea7c0945fd36)
  - 참고: 다른 테넌트 'Contoso 랩'(26e076b7-...)는 비활성으로 차단되어 로그인 실패 (무시, 영향 없음)
  - 사용할 구독으로 `Pay-As-You-Go` 선택 → `az account set --subscription 56d01583-7b34-4be7-84c5-477e86bfdb18` 실행, 성공
- **리소스 그룹/리전 결정**: `rg-scheduling-optimizer` / `koreacentral` 로 확정 (사용자 확인)
- **리소스 그룹 생성**: `az group create --name rg-scheduling-optimizer --location koreacentral` 실행, 성공
- **Resource Provider 등록**: `Microsoft.ContainerRegistry` 미등록 상태였음 → `az provider register --namespace Microsoft.ContainerRegistry --wait` 실행, Registered 확인
- **ACR 생성**: `az acr create --resource-group rg-scheduling-optimizer --name acrschedulingopt --sku Basic --location koreacentral` 실행, 성공. Login server: acrschedulingopt.azurecr.io
- **PostgreSQL Flexible Server 보류**: 비용 문의 후, 지금은 클라우드 DB를 생성하지 않고 로컬 Docker Postgres로 개발 진행하기로 결정. 배포 단계에서 다시 생성 검토.
- **로컬 DB의 원격 접근 불가 이슈 확인**: 실제 배포 시 Container Apps에서 로컬 Docker DB에 접근할 수 없음을 확인 → 클라우드 PostgreSQL 즉시 생성으로 결정 전환
- **Resource Provider 등록**: `Microsoft.DBforPostgreSQL` 미등록 → `az provider register --namespace Microsoft.DBforPostgreSQL --wait` 실행, Registered 확인
- **PostgreSQL Flexible Server 생성**: `az postgres flexible-server create --resource-group rg-scheduling-optimizer --name psql-scheduling-optimizer --location koreacentral --admin-user schedadmin --sku-name Standard_B1ms --tier Burstable --storage-size 32 --version 16 --public-access 0.0.0.0-255.255.255.255` 실행, 성공. FQDN: psql-scheduling-optimizer.postgres.database.azure.com
  - ⚠️ 공개 접근(0.0.0.0-255.255.255.255)으로 임시 설정 — 운영 전 Container Apps outbound IP로 방화벽 규칙 좁혀야 함
  - 관리자 계정: schedadmin / 비밀번호는 랜덤 생성, 로컬 `.env`(gitignore 처리됨)에 저장
- **애플리케이션 DB 생성**: `az postgres flexible-server db create --name scheduling_optimizer` 실행, 성공 (UTF8/en_US.utf8)
- **Backend 이미지 빌드 & ACR push**: `az acr build --registry acrschedulingopt --image scheduling-backend:v1 --image scheduling-backend:latest ./backend` 실행, 성공 (Run ID: de1, 37초 소요). 로컬 docker login 불필요 (ACR Tasks로 클라우드 빌드)
  - 이미지: `acrschedulingopt.azurecr.io/scheduling-backend:v1` / `:latest`, digest sha256:0c262fcf...
- **CLI extension/provider 준비**: `az extension add --name containerapp --upgrade` 설치, `Microsoft.App` / `Microsoft.OperationalInsights` provider 등록 완료
- **Container Apps Environment 생성**: `az containerapp env create --name env-scheduling-optimizer --resource-group rg-scheduling-optimizer --location koreacentral` 실행, 성공. Log Analytics workspace 자동 생성됨 (workspace-rgschedulingoptimizer7tkl). Static IP: 4.230.97.71
- **Container App(backend) 생성**: `az containerapp create --name ca-scheduling-backend --image acrschedulingopt.azurecr.io/scheduling-backend:v1 --registry-identity system --target-port 8000 --ingress external --cpu 0.25 --memory 0.5Gi --min-replicas 0 --max-replicas 1` 실행, 성공
  - System-assigned managed identity로 ACR pull 권한 자동 부여 (별도 자격증명 불필요)
  - 환경변수 DATABASE_URL 주입 (PostgreSQL 연결)
  - 공개 URL: https://ca-scheduling-backend.ambitiousdune-51dd5b07.koreacentral.azurecontainerapps.io/
  - 동작 확인: `curl .../docs` → HTTP 200 (FastAPI 정상 기동)
  - ⚠️ Consumption plan은 outbound IP가 다수(150+개) 동적 할당되어 PostgreSQL 방화벽을 특정 IP로 좁히기 어려움 → "Allow Azure services" 룰로 전환 검토 필요 (현재는 임시로 전체 IP 허용 유지 중)
- **Static Web App 생성**: `koreacentral` 미지원 확인됨 (지원 리전: centralus, eastus2, westus2, westeurope, eastasia) → `eastasia`로 결정
  - `Microsoft.Web` provider 미등록 → 등록 후 재시도, 성공
  - `az staticwebapp create --name swa-scheduling-optimizer --resource-group rg-scheduling-optimizer --location eastasia --sku Free` 실행, 성공. Hostname: agreeable-river-0e656e000.7.azurestaticapps.net
- **Frontend 빌드 & 배포**: `VITE_API_URL=https://ca-scheduling-backend.../​` 로 `npm run build`, `npx @azure/static-web-apps-cli deploy ./dist --deployment-token ... --env production` 실행, 성공
  - 동작 확인: `curl https://agreeable-river-0e656e000.7.azurestaticapps.net/` → HTTP 200
  - 배포 토큰은 임시 파일에 저장 후 사용 즉시 삭제, 저장소에는 커밋되지 않음
  - 참고: Bitbucket 저장소와 직접 연동되지 않은 1회성 CLI 배포. GitHub/Azure DevOps 연동 CI/CD는 미설정 상태
