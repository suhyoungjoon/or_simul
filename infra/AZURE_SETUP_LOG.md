# Azure 인프라 구축 로그

## 리소스 요약 (업데이트 예정)

| 리소스 | 이름 | 리전 | SKU/Tier | 상태 |
|---|---|---|---|---|
| Resource Group | (생성 예정) | - | - | - |

---

## 작업 기록

### 2026-06-28
- **Azure CLI 설치**: Homebrew로 `azure-cli` 2.87.0 설치 완료 (`brew install azure-cli`)
- **az login**: 브라우저 인증으로 로그인 완료. 계정: tjdudwns@gmail.com
  - 구독 2개 확인됨: `Pay-As-You-Go` (56d01583-7b34-4be7-84c5-477e86bfdb18), `종량제` (3d01b9a5-0f1e-46b1-b98e-ea7c0945fd36)
  - 참고: 다른 테넌트 'Contoso 랩'(26e076b7-...)는 비활성으로 차단되어 로그인 실패 (무시, 영향 없음)
  - 사용할 구독으로 `Pay-As-You-Go` 선택 → `az account set --subscription 56d01583-7b34-4be7-84c5-477e86bfdb18` 실행, 성공
- **리소스 그룹/리전 결정**: `rg-scheduling-optimizer` / `koreacentral` 로 확정 (사용자 확인)
