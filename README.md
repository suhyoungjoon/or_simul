# 설치 스케줄링 최적화 시스템

OR-Tools 기반 인터넷/IPTV 설치 작업자 배정 최적화 웹 애플리케이션

## 프로젝트 구조

```
scheduling-optimizer/
├── backend/
│   ├── main.py              # FastAPI 서버 + 최적화 엔진
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # 메인 앱 (탭, 통계, 라우팅)
│   │   ├── components/
│   │   │   ├── SidePanel.jsx   # 조건 설정 패널
│   │   │   ├── MapCanvas.jsx   # 지도 + 동선 시각화
│   │   │   └── Timeline.jsx    # 작업자별 타임라인
│   │   └── utils/
│   │       └── dataGenerator.js  # 가상 데이터 생성
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
└── bitbucket-pipelines.yml
```

---

## 로컬 실행 (Claude Code 터미널에서)

### 방법 1 — 직접 실행 (권장)

**백엔드:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**프론트엔드 (새 터미널):**
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```
→ http://localhost:5173 접속

### 방법 2 — Docker Compose
```bash
docker-compose up --build
```
→ http://localhost:5173 접속

---

## AWS 배포

### 사전 준비
1. AWS CLI 설정 (`aws configure`)
2. ECR 레포지토리 생성: `scheduling-optimizer-api`
3. ECS 클러스터 생성: `scheduling-cluster`
4. S3 버킷 + CloudFront 배포 생성

### Bitbucket 환경변수 설정
Repository Settings → Repository variables:
```
AWS_ACCESS_KEY_ID     = (IAM 키)
AWS_SECRET_ACCESS_KEY = (IAM 시크릿)
AWS_ACCOUNT_ID        = (12자리 계정 ID)
S3_BUCKET_NAME        = (프론트엔드 S3 버킷명)
CF_DISTRIBUTION_ID    = (CloudFront 배포 ID)
VITE_API_URL          = https://your-api-endpoint.com
```

### 배포 흐름
```
git push origin main
  → Bitbucket Pipeline 자동 트리거
  → Backend: Docker 빌드 → ECR push → ECS 롤링 업데이트
  → Frontend: npm build → S3 sync → CloudFront 캐시 무효화
```

---

## 실제 OR-Tools 적용 (운영 전환)

현재 `backend/main.py`의 `optimize()` 함수는 스코어링 기반 근사 알고리즘입니다.
실제 OR-Tools VRPTW 솔버로 교체하려면:

```bash
pip install ortools
```

`main.py`의 `optimize()` 함수를 아래 패키지로 교체:
```python
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp
```

자세한 구현은 docs/ortools_vrptw.md 참고

---

## 실제 DB 연동 (Oracle → RDS)

1. `backend/requirements.txt`에서 psycopg2, sqlalchemy 주석 해제
2. `backend/db.py` 생성 (RDS Aurora 연결)
3. `main.py`의 데이터 수신 부분을 DB 조회로 교체:
   ```python
   workers   = await db.get_available_workers(date, region)
   customers = await db.get_pending_customers(date, region)
   ```
4. 배치 파이프라인: Oracle → S3 → Lambda → RDS (별도 구성)
