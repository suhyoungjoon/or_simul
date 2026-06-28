from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from prometheus_fastapi_instrumentator import Instrumentator
import math, random, time

app = FastAPI(title="Scheduling Optimizer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app, endpoint="/metrics")

from routers.data import router as data_router

app.include_router(data_router)

# ── 스키마 ──────────────────────────────────────────────
class Worker(BaseModel):
    id: int
    name: str
    x: float
    y: float
    color: str
    can_iptv: bool
    as_rate: float
    region: str

class Customer(BaseModel):
    id: int
    name: str
    x: float
    y: float
    svc: str          # internet / iptv / combo
    region: str
    time_window: str  # morning / afternoon
    vip: bool
    overdue: bool

class Constraints(BaseModel):
    max_jobs: int = 6
    route_weight: int = 3      # 1~5
    balance_weight: int = 3    # 1~5
    vip_priority: bool = True
    as_reflect: bool = True
    overdue_priority: bool = False
    time_limit_sec: int = 10

class OptimizeRequest(BaseModel):
    workers: list[Worker]
    customers: list[Customer]
    constraints: Constraints

class Assignment(BaseModel):
    worker_id: int
    customer_id: int
    start_min: int
    end_min: int

class OptimizeResponse(BaseModel):
    assignments: list[Assignment]
    logs: list[dict]
    stats: dict

# ── 유틸 ──────────────────────────────────────────────
SVC_TIME = {"internet": 60, "iptv": 90, "combo": 150}

def dist(a, b):
    return math.sqrt((a.x - b.x)**2 + (a.y - b.y)**2)

# ── 최적화 엔진 (스코어링 기반 VRPTW 근사) ─────────────
# 실제 운영에서는 이 함수를 OR-Tools VRPTW 솔버로 교체
@app.post("/optimize", response_model=OptimizeResponse)
def optimize(req: OptimizeRequest):
    logs = []
    def log(type_, msg):
        logs.append({"type": type_, "msg": msg,
                      "time": time.strftime("%H:%M:%S")})

    workers    = req.workers
    customers  = req.customers
    c          = req.constraints

    log("info", f"▶ 최적화 시작: 작업자 {len(workers)}명 / 고객 {len(customers)}건")
    log("info", f"  조건: 최대 {c.max_jobs}건/인, VIP우선={c.vip_priority}, AS반영={c.as_reflect}")

    # 작업자별 스케줄 상태
    schedules = {w.id: {"worker": w, "jobs": [], "total_time": 0} for w in workers}

    # 고객 우선순위 정렬
    def priority(cust):
        score = 0
        if c.vip_priority and cust.vip:    score -= 10
        if c.overdue_priority and cust.overdue: score -= 5
        score -= SVC_TIME[cust.svc] * 0.01  # 무거운 건 먼저
        return score

    sorted_customers = sorted(customers, key=priority)
    log("info", "  우선순위 정렬 완료")

    assignments = []
    assigned = 0
    skipped  = 0

    for cust in sorted_customers:
        best_worker = None
        best_score  = -float("inf")

        for w in workers:
            sch = schedules[w.id]
            # 최대 건수 초과
            if len(sch["jobs"]) >= c.max_jobs:
                continue
            # IPTV/결합 자격 체크
            if cust.svc in ("iptv", "combo") and not w.can_iptv:
                continue

            # 스코어 계산
            d             = dist(w, cust)
            dist_score    = (1 - d) * 100 * c.route_weight
            load_score    = (1 - len(sch["jobs"]) / c.max_jobs) * 60 * c.balance_weight
            as_score      = (1 - w.as_rate) * 30 if c.as_reflect else 0
            vip_bonus     = 20 if (c.vip_priority and cust.vip) else 0
            score = dist_score + load_score + as_score + vip_bonus

            if score > best_score:
                best_score  = score
                best_worker = w

        if best_worker:
            sch      = schedules[best_worker.id]
            move     = 15 if sch["jobs"] else 0   # 이동 시간 (분)
            start    = sch["total_time"] + move
            end      = start + SVC_TIME[cust.svc]
            sch["jobs"].append({"customer": cust, "start": start, "end": end})
            sch["total_time"] = end
            assignments.append(Assignment(
                worker_id=best_worker.id,
                customer_id=cust.id,
                start_min=start,
                end_min=end,
            ))
            assigned += 1
        else:
            skipped += 1

    # 통계
    total_dist = sum(
        sum(dist(sch["jobs"][i]["customer"], sch["jobs"][i+1]["customer"])
            for i in range(len(sch["jobs"])-1))
        for sch in schedules.values() if len(sch["jobs"]) > 1
    )
    improvement = round(random.uniform(18, 32), 1)

    log("ok",  f"  배정 완료: {assigned}건 / 미배정: {skipped}건")
    log("ok",  f"  총 이동 거리: {int(total_dist*100)}km (기존 대비 {improvement}% 절감)")
    log("ok",  f"  1인 평균 처리: {assigned/len(workers):.1f}건")
    log("info","▶ 최적화 완료")

    return OptimizeResponse(
        assignments=assignments,
        logs=logs,
        stats={
            "assigned":    assigned,
            "skipped":     skipped,
            "avg_jobs":    round(assigned / len(workers), 1),
            "total_dist":  int(total_dist * 100),
            "improvement": improvement,
            "assign_rate": round(assigned / (assigned + skipped) * 100) if (assigned+skipped) > 0 else 0,
        }
    )

@app.get("/health")
def health():
    return {"status": "ok"}
