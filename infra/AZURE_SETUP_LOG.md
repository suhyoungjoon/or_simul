# Azure 인프라 구축 로그

## 리소스 요약 (업데이트 예정)

| 리소스 | 이름 | 리전 | SKU/Tier | 상태 |
|---|---|---|---|---|
| Resource Group | rg-scheduling-optimizer | koreacentral | - | 생성됨 |
| Container Registry | acrschedulingopt (acrschedulingopt.azurecr.io) | koreacentral | Basic | 생성됨 |
| PostgreSQL Flexible Server | psql-scheduling-optimizer (psql-scheduling-optimizer.postgres.database.azure.com) | koreacentral | Burstable B1ms, 32GiB, v16 | 생성됨 |

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
