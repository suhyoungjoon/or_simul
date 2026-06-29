import { useState } from "react";

function Toggle({ value, onChange }) {
  return (
    <div onClick={()=>onChange(!value)} style={{
      width:34,height:18,borderRadius:9,cursor:"pointer",position:"relative",
      background: value ? "#4f6ef7" : "#2d3048",
      border: `1px solid ${value ? "#4f6ef7" : "#2e3250"}`,
      transition:".2s", flexShrink:0,
    }}>
      <div style={{
        position:"absolute",top:2,left: value ? 18 : 2,
        width:12,height:12,borderRadius:"50%",background:"#fff",transition:".2s",
      }}/>
    </div>
  );
}

function RangeField({ label, id, min, max, value, onChange, displayFn }) {
  return (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:11,color:"#8b91b5",marginBottom:4}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <input type="range" min={min} max={max} value={value}
          onChange={e=>onChange(+e.target.value)}
          style={{flex:1,accentColor:"#4f6ef7"}}/>
        <span style={{fontSize:11,color:"#4f6ef7",width:36,textAlign:"right"}}>
          {displayFn ? displayFn(value) : value}
        </span>
      </div>
    </div>
  );
}

const STRENGTH = ['최소','낮음','중간','높음','최대'];

export default function SidePanel({ onOptimize, loading }) {
  const [cfg, setCfg] = useState({
    date: "2025-06-27",
    region: "all",
    svc: "all",
    maxJobs: 6,
    routeWeight: 3,
    balanceWeight: 3,
    vip: true,
    as: true,
    overdue: false,
  });
  const set = (k,v) => setCfg(p=>({...p,[k]:v}));

  const sStyle = {
    width:"100%", background:"#232636", border:"1px solid #2e3250",
    color:"#e8eaf6", padding:"6px 8px", borderRadius:6, fontSize:12,
  };

  return (
    <div style={{background:"#1a1d27",borderRight:"1px solid #2e3250",
      display:"flex",flexDirection:"column",overflowY:"auto",height:"100%"}}>

      {/* 기본 설정 */}
      <Section title="기본 설정">
        <Field label="배정 날짜">
          <select style={sStyle} value={cfg.date} onChange={e=>set("date",e.target.value)}>
            <option value="2025-06-27">2025-06-27 (오늘)</option>
            <option value="2025-06-28">2025-06-28 (내일)</option>
            <option value="2025-06-29">2025-06-29</option>
          </select>
        </Field>
        <Field label="대상 구역">
          <select style={sStyle} value={cfg.region} onChange={e=>set("region",e.target.value)}>
            <option value="all">전체 구역</option>
            <option value="A">A구역 (강남/서초)</option>
            <option value="B">B구역 (송파/강동)</option>
            <option value="C">C구역 (마포/서대문)</option>
          </select>
        </Field>
        <Field label="서비스 유형">
          <select style={sStyle} value={cfg.svc} onChange={e=>set("svc",e.target.value)}>
            <option value="all">전체</option>
            <option value="internet">인터넷 단독</option>
            <option value="iptv">IPTV 단독</option>
            <option value="combo">결합 (인터넷+IPTV)</option>
          </select>
        </Field>
      </Section>

      {/* 최적화 조건 */}
      <Section title="최적화 조건">
        <RangeField label="작업자 1인 최대 건수" min={3} max={8} value={cfg.maxJobs}
          onChange={v=>set("maxJobs",v)} />
        <RangeField label="동선 최적화 강도" min={1} max={5} value={cfg.routeWeight}
          onChange={v=>set("routeWeight",v)} displayFn={v=>STRENGTH[v-1]} />
        <RangeField label="부하 균등화 강도" min={1} max={5} value={cfg.balanceWeight}
          onChange={v=>set("balanceWeight",v)} displayFn={v=>STRENGTH[v-1]} />
        <ToggleRow label="VIP 고객 우선 배정" value={cfg.vip}    onChange={v=>set("vip",v)} />
        <ToggleRow label="AS 이력 반영"        value={cfg.as}     onChange={v=>set("as",v)} />
        <ToggleRow label="희망일 초과 우선"    value={cfg.overdue} onChange={v=>set("overdue",v)} />
      </Section>

      {/* 실행 버튼 */}
      <div style={{padding:"14px 16px",marginTop:"auto",borderTop:"1px solid #2e3250"}}>
        <button onClick={()=>onOptimize(cfg)} disabled={loading}
          style={{
            width:"100%",padding:10,background: loading ? "#2d3048" : "#4f6ef7",
            color: loading ? "#5a6085" : "#fff",border:"none",borderRadius:8,
            fontSize:13,fontWeight:600,cursor: loading ? "not-allowed" : "pointer",
          }}>
          {loading ? "⏳ 최적화 중..." : "⚡ 최적화 실행"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{padding:"14px 16px",borderBottom:"1px solid #2e3250"}}>
      <div style={{fontSize:10,fontWeight:600,color:"#5a6085",textTransform:"uppercase",
        letterSpacing:".08em",marginBottom:10}}>{title}</div>
      {children}
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{marginBottom:9}}>
      <div style={{fontSize:11,color:"#8b91b5",marginBottom:4}}>{label}</div>
      {children}
    </div>
  );
}
function ToggleRow({ label, value, onChange }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
      <span style={{fontSize:12,color:"#8b91b5"}}>{label}</span>
      <Toggle value={value} onChange={onChange}/>
    </div>
  );
}
