import { SVC_LABEL, SVC_TIME } from "../utils/dataGenerator";

const DAY_START = 9*60, DAY_END = 19*60, TOTAL = DAY_END - DAY_START;
const HOURS = ['9시','10시','11시','12시','13시','14시','15시','16시','17시','18시'];

function toHHMM(min) {
  const abs = DAY_START + min;
  return `${Math.floor(abs/60)}:${String(abs%60).padStart(2,'0')}`;
}

export default function Timeline({ workers, customers, assignments }) {
  const wMap = Object.fromEntries(workers.map(w=>[w.id,w]));
  const cMap = Object.fromEntries(customers.map(c=>[c.id,c]));

  const schedules = workers.map(w => ({
    worker: w,
    jobs: assignments
      .filter(a => a.worker_id === w.id)
      .sort((a,b) => a.start_min - b.start_min),
  }));

  return (
    <div>
      {/* 작업자 요약 */}
      <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(workers.length,4)},1fr)`,gap:10,marginBottom:14}}>
        {schedules.map(s=>(
          <div key={s.worker.id} style={{background:"#1a1d27",border:`1px solid #2e3250`,borderLeft:`3px solid ${s.worker.color}`,borderRadius:10,padding:"10px 14px"}}>
            <div style={{fontSize:10,color:"#5a6085",textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>{s.worker.name}</div>
            <div style={{fontSize:22,fontWeight:600,color:"#e8eaf6"}}>{s.jobs.length}<span style={{fontSize:14,color:"#5a6085"}}>건</span></div>
            <div style={{fontSize:11,color:"#5a6085",marginTop:2}}>{s.jobs.reduce((acc,j)=>acc+(j.end_min-j.start_min),0)}분 작업</div>
          </div>
        ))}
      </div>

      {/* 타임라인 */}
      <div style={{background:"#1a1d27",border:"1px solid #2e3250",borderRadius:10,overflow:"hidden"}}>
        {/* 헤더 */}
        <div style={{display:"grid",gridTemplateColumns:"100px 1fr",borderBottom:"1px solid #2e3250"}}>
          <div style={{padding:"8px 12px",fontSize:10,color:"#5a6085",textTransform:"uppercase",letterSpacing:".06em",borderRight:"1px solid #2e3250"}}>작업자</div>
          <div style={{display:"flex",padding:"0 8px"}}>
            {HOURS.map(h=>(
              <div key={h} style={{flex:1,textAlign:"center",fontSize:10,color:"#5a6085",padding:"8px 0"}}>{h}</div>
            ))}
          </div>
        </div>

        {/* 행 */}
        {schedules.map(s=>(
          <div key={s.worker.id} style={{display:"grid",gridTemplateColumns:"100px 1fr",borderTop:"1px solid #2e3250"}}>
            <div style={{padding:"10px 12px",borderRight:"1px solid #2e3250"}}>
              <div style={{fontSize:12,fontWeight:500,color:"#e8eaf6"}}>{s.worker.name}</div>
              <div style={{fontSize:10,color:"#5a6085",marginTop:2}}>{s.jobs.length}건</div>
            </div>
            <div style={{position:"relative",padding:8,background:"#232636",minHeight:44}}>
              {s.jobs.map(j=>{
                const c = cMap[j.customer_id];
                if (!c) return null;
                const left  = (j.start_min / TOTAL * 100).toFixed(1);
                const width = ((j.end_min - j.start_min) / TOTAL * 100).toFixed(1);
                return (
                  <div key={j.customer_id}
                    title={`${c.name} (${SVC_LABEL[c.svc]}) ${toHHMM(j.start_min)}~${toHHMM(j.end_min)}`}
                    style={{
                      position:"absolute", top:6, left:`${left}%`, width:`${width}%`,
                      height:"calc(100% - 12px)", borderRadius:5,
                      background:s.worker.color, display:"flex",
                      alignItems:"center", padding:"0 6px",
                      fontSize:10, fontWeight:500, color:"#fff",
                      overflow:"hidden", whiteSpace:"nowrap", cursor:"pointer",
                    }}>
                    {c.name} ({SVC_LABEL[c.svc]})
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
