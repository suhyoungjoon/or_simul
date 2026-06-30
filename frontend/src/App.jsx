import { useState, useEffect } from "react";
import SidePanel from "./components/SidePanel";
import MapView from "./components/MapView";
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
  const [optimizedCustomers, setOptimizedCustomers] = useState([]);
  const [lookupAddedIds, setLookupAddedIds] = useState(new Set());
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);
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
    setLookupAddedIds(prev => new Set(prev).add(customer.id));
  }

  async function handleOptimize(cfg) {
    setLoading(true); setError(null);

    const filteredCustomers = customers.filter(c =>
      (cfg.region === "all" || c.region === cfg.region) &&
      (cfg.svc === "all" || c.svc === cfg.svc)
    );

    try {
      const res = await fetch(`${API}/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workers: workers,
          customers: filteredCustomers,
          constraints: {
            max_jobs:       cfg.maxJobs,
            route_weight:   cfg.routeWeight,
            balance_weight: cfg.balanceWeight,
            vip_priority:   cfg.vip,
            as_reflect:     cfg.as,
            overdue_priority: cfg.overdue,
          },
        }),
      });
      if (!res.ok) throw new Error(`서버 오류: ${res.status}`);
      setResult(await res.json());
      setOptimizedCustomers(filteredCustomers);
      setSelectedWorkerId(null);
      setTab("map");
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const assignments = result?.assignments ?? [];
  const stats       = result?.stats ?? {};
  const logs        = result?.logs  ?? [];

  const displayAssignments = selectedWorkerId
    ? assignments.filter(a => a.worker_id === selectedWorkerId)
    : assignments;
  const displayWorkers = selectedWorkerId
    ? workers.filter(w => w.id === selectedWorkerId)
    : workers;
  const displayCustomers = selectedWorkerId
    ? optimizedCustomers.filter(c => displayAssignments.some(a => a.customer_id === c.id))
    : optimizedCustomers;
  const jobCountByWorker = Object.fromEntries(
    workers.map(w => [w.id, assignments.filter(a => a.worker_id === w.id).length])
  );

  return (
    <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gridTemplateRows:"52px 1fr",
      height:"100vh",background:"#0f1117",color:"#e8eaf6",fontFamily:"'Segoe UI',system-ui,sans-serif",fontSize:13}}>

      {/* 헤더 */}
      <div style={{gridColumn:"1/-1",background:"#1a1d27",borderBottom:"1px solid #2e3250",
        display:"flex",alignItems:"center",padding:"0 20px",gap:12}}>
        <div>
          <div style={{fontSize:15,fontWeight:600,letterSpacing:"-.3px"}}>⚡ 설치 스케줄링 최적화</div>
          <div style={{fontSize:12,color:"#5a6085"}}>OR-Tools 기반 작업자 배정 시뮬레이터</div>
        </div>
        <div style={{marginLeft:"auto",background:"#4f6ef7",color:"#fff",
          fontSize:10,padding:"3px 8px",borderRadius:4,fontWeight:500}}>DEMO</div>
      </div>

      {/* 사이드패널 */}
      <SidePanel onOptimize={handleOptimize} loading={loading} />

      {/* 메인 */}
      <div style={{display:"grid",gridTemplateRows:"auto 1fr",overflow:"hidden"}}>
        {/* 탭 */}
        <div style={{background:"#1a1d27",borderBottom:"1px solid #2e3250",
          display:"flex",alignItems:"center",padding:"0 16px",gap:2}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{padding:"12px 14px",fontSize:12,cursor:"pointer",border:"none",
                background:"transparent",borderBottom:`2px solid ${tab===t.id?"#4f6ef7":"transparent"}`,
                color: tab===t.id ? "#4f6ef7" : "#5a6085"}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 콘텐츠 */}
        <div style={{overflow:"auto",padding:16}}>
          {error && (
            <div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",
              borderRadius:8,padding:"10px 14px",color:"#ef4444",marginBottom:14,fontSize:12}}>
              ⚠️ {error} — 백엔드 서버가 실행 중인지 확인하세요 (<code>uvicorn main:app --reload</code>)
            </div>
          )}

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

          {loading && (
            <div style={{padding:"60px 0",textAlign:"center",color:"#5a6085"}}>
              <div style={{marginBottom:16}}>알고리즘 실행 중...</div>
              <div style={{height:3,background:"#4f6ef7",borderRadius:2,
                animation:"loading 1s ease-in-out infinite alternate",width:"60%",margin:"0 auto"}}/>
              <style>{`@keyframes loading{from{width:20%}to{width:90%}}`}</style>
            </div>
          )}

          {result && !loading && (
            <>
              {/* 통계 카드 */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
                {[
                  { label:"배정 완료",  val:stats.assigned,    unit:"건", delta:`미배정 ${stats.skipped}건`, up:true },
                  { label:"1인 평균",   val:stats.avg_jobs,    unit:"건", delta:"효율 향상",                up:true },
                  { label:"이동 절감",  val:`${stats.improvement}`, unit:"%", delta:"기존 대비",              up:true },
                  { label:"배정률",     val:stats.assign_rate, unit:"%", delta: stats.skipped===0?"전원 배정":"미배정 존재", up:stats.skipped===0 },
                ].map(s=>(
                  <div key={s.label} style={{background:"#1a1d27",border:"1px solid #2e3250",borderRadius:10,padding:"12px 14px"}}>
                    <div style={{fontSize:10,color:"#5a6085",textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>{s.label}</div>
                    <div style={{fontSize:22,fontWeight:600,color:"#e8eaf6"}}>{s.val}<span style={{fontSize:14,color:"#5a6085"}}>{s.unit}</span></div>
                    <div style={{fontSize:11,marginTop:4,color: s.up?"#22c55e":"#ef4444"}}>{s.up?"▲":"▼"} {s.delta}</div>
                  </div>
                ))}
              </div>

              <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                <div style={{flex:1,minWidth:0}}>
                  {tab === "map"      && <MapView />}
                  {tab === "timeline" && <Timeline  workers={displayWorkers} customers={displayCustomers} assignments={displayAssignments} />}
                  {tab === "table"    && <AssignTable workers={displayWorkers} customers={displayCustomers} assignments={displayAssignments} lookupAddedIds={lookupAddedIds} />}
                  {tab === "log"      && <LogView logs={logs} />}
                </div>
                {tab !== "log" && (
                  <WorkerFilterList
                    workers={workers}
                    jobCountByWorker={jobCountByWorker}
                    selectedWorkerId={selectedWorkerId}
                    onSelect={setSelectedWorkerId}
                  />
                )}
              </div>
            </>
          )}
          {tab === "lookup" && <OrderLookup apiBase={API} onAddToOptimization={mergeCustomer} />}
        </div>
      </div>
    </div>
  );
}

// 작업자 필터 목록 (옆에서 작업자 선택 시 해당 작업자 결과만 표시)
function WorkerFilterList({ workers, jobCountByWorker, selectedWorkerId, onSelect }) {
  const itemStyle = (active) => ({
    display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:8,
    cursor:"pointer", marginBottom:4, fontSize:12,
    background: active ? "rgba(79,110,247,.15)" : "transparent",
    border: `1px solid ${active ? "#4f6ef7" : "transparent"}`,
  });
  return (
    <div style={{width:160,flexShrink:0,background:"#1a1d27",border:"1px solid #2e3250",
      borderRadius:10,padding:10}}>
      <div style={{fontSize:10,color:"#5a6085",textTransform:"uppercase",letterSpacing:".06em",
        marginBottom:8,padding:"0 2px"}}>작업자별 보기</div>
      <div onClick={()=>onSelect(null)} style={itemStyle(selectedWorkerId===null)}>
        <div style={{width:10,height:10,borderRadius:"50%",background:"#5a6085"}} />
        전체
      </div>
      {workers.map(w=>(
        <div key={w.id} onClick={()=>onSelect(w.id)} style={itemStyle(selectedWorkerId===w.id)}>
          <div style={{width:10,height:10,borderRadius:"50%",background:w.color}} />
          <span style={{flex:1,color: selectedWorkerId===w.id?"#e8eaf6":"#8b91b5"}}>{w.name}</span>
          <span style={{fontSize:10,color:"#5a6085"}}>{jobCountByWorker[w.id] ?? 0}건</span>
        </div>
      ))}
    </div>
  );
}

// 배정 목록 테이블
function AssignTable({ workers, customers, assignments, lookupAddedIds }) {
  const wMap = Object.fromEntries(workers.map(w=>[w.id,w]));
  const aMap = Object.fromEntries(assignments.map(a=>[a.customer_id,a]));
  const DAY_START = 9*60;
  const toHHMM = min => {
    const abs = DAY_START + min;
    return `${Math.floor(abs/60)}:${String(abs%60).padStart(2,'0')}`;
  };
  const svcColor = { internet:"rgba(79,110,247,.2)", iptv:"rgba(124,92,252,.2)", combo:"rgba(6,182,212,.2)" };
  const svcText  = { internet:"#7c9fff", iptv:"#b39fff", combo:"#67dff0" };
  const th = {padding:"8px 12px",background:"#232636",color:"#5a6085",fontSize:10,
    textTransform:"uppercase",letterSpacing:".06em",textAlign:"left",
    borderBottom:"1px solid #2e3250",fontWeight:500};
  const td = {padding:"9px 12px",borderBottom:"1px solid #2e3250",fontSize:12,color:"#8b91b5"};
  return (
    <div style={{background:"#1a1d27",border:"1px solid #2e3250",borderRadius:10,overflow:"hidden"}}>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["고객","구역","서비스","작업자","예정 시간","희망 시간대","상태"].map(h=>(
          <th key={h} style={th}>{h}</th>))}</tr></thead>
        <tbody>
          {customers.map(c=>{
            const a=aMap[c.id], w=a?wMap[a.worker_id]:null;
            return (
              <tr key={c.id} style={lookupAddedIds?.has(c.id) ? {background:"rgba(6,182,212,.06)"} : undefined}>
                <td style={td}>{c.name}{c.vip?" ⭐":""}{lookupAddedIds?.has(c.id) && (
                  <span style={{marginLeft:6,display:"inline-block",padding:"1px 6px",borderRadius:4,
                    fontSize:9,fontWeight:600,background:"rgba(6,182,212,.18)",color:"#67dff0"}}>
                    🔍 온디맨드 조회
                  </span>
                )}</td>
                <td style={td}>{c.region ?? <span style={{color:"#5a6085"}}>—</span>}</td>
                <td style={td}><span style={{display:"inline-block",padding:"2px 7px",borderRadius:4,
                  fontSize:10,fontWeight:500,background:svcColor[c.svc],color:svcText[c.svc]}}>
                  {SVC_LABEL[c.svc]}</span></td>
                <td style={td}>{w?<><span style={{color:w.color}}>●</span> {w.name}</>:<span style={{color:"#5a6085"}}>—</span>}</td>
                <td style={td}>{a?`${toHHMM(a.start_min)} ~ ${toHHMM(a.end_min)}`:<span style={{color:"#5a6085"}}>—</span>}</td>
                <td style={td}>{c.time_window==="morning"?"오전":"오후"}</td>
                <td style={td}><span style={{color:a?"#22c55e":"#f59e0b"}}>{a?"✓ 배정완료":"⏳ 미배정"}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 로그 뷰
function LogView({ logs }) {
  const colors = { ok:"#22c55e", info:"#06b6d4", warn:"#f59e0b", error:"#ef4444" };
  return (
    <>
      <div style={{background:"#1a1d27",border:"1px solid #2e3250",borderRadius:10,
        padding:"12px 14px",fontFamily:"monospace",fontSize:11,
        color:"#8b91b5",maxHeight:320,overflowY:"auto"}}>
        {logs.map((l,i)=>(
          <div key={i} style={{marginBottom:4,lineHeight:1.5}}>
            <span style={{color:"#5a6085"}}>[{l.time}]</span>{" "}
            <span style={{color:colors[l.type]||"#8b91b5"}}>{l.msg}</span>
          </div>
        ))}
      </div>
      <div style={{marginTop:14,color:"#5a6085",fontSize:11,padding:"0 2px"}}>
        실제 OR-Tools(VRPTW 솔버)는 이 과정을 수리 최적화로 수행합니다.<br/>
        이 데모는 스코어링 기반 근사 알고리즘으로 동일한 개념을 시뮬레이션합니다.
      </div>
    </>
  );
}
