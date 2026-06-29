import { useEffect, useRef } from "react";
import { SVC_LABEL } from "../utils/dataGenerator";

const REGIONS = {
  A: { cx:0.55, cy:0.55, r:0.25, name:'강남/서초' },
  B: { cx:0.75, cy:0.65, r:0.22, name:'송파/강동' },
  C: { cx:0.25, cy:0.40, r:0.22, name:'마포/서대문' },
};

export default function MapCanvas({ workers, customers, assignments }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;

    // worker lookup
    const wMap = Object.fromEntries(workers.map(w => [w.id, w]));
    // assignment lookup: customerId → {worker, startMin, endMin}
    const aMap = Object.fromEntries(
      assignments.map(a => [a.customer_id, { worker: wMap[a.worker_id], ...a }])
    );
    // worker → ordered customers
    const routes = {};
    workers.forEach(w => { routes[w.id] = []; });
    assignments.forEach(a => routes[a.worker_id]?.push(a));

    // 배경
    ctx.fillStyle = "#141720"; ctx.fillRect(0,0,W,H);

    // 격자
    ctx.strokeStyle = "rgba(255,255,255,.04)"; ctx.lineWidth = 1;
    for (let x=0; x<W; x+=40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y=0; y<H; y+=40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    // 구역
    Object.entries(REGIONS).forEach(([key,r]) => {
      const radius = r.r*Math.min(W,H);
      ctx.beginPath();
      ctx.arc(r.cx*W, r.cy*H, radius, 0, Math.PI*2);
      ctx.fillStyle   = "rgba(79,110,247,.08)";  ctx.fill();
      ctx.strokeStyle = "rgba(79,110,247,.45)";  ctx.lineWidth = 1.5;
      ctx.setLineDash([6,4]); ctx.stroke(); ctx.setLineDash([]);

      const label = `${key}구역 · ${r.name}`;
      const labelX = r.cx*W, labelY = r.cy*H - radius - 12;
      ctx.font = "bold 12px system-ui";
      const textW = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(15,17,23,.85)";
      ctx.fillRect(labelX - textW/2 - 6, labelY - 12, textW + 12, 18);
      ctx.fillStyle = "#9db4ff";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, labelX, labelY - 3);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    });

    // 동선
    workers.forEach(w => {
      const jobs = routes[w.id].slice().sort((a,b) => a.start_min - b.start_min);
      if (!jobs.length) return;
      ctx.strokeStyle = w.color + "88"; ctx.lineWidth = 1.5;
      ctx.setLineDash([4,3]); ctx.beginPath();
      ctx.moveTo(w.x*W, w.y*H);
      jobs.forEach(j => {
        const c = customers.find(c => c.id === j.customer_id);
        if (c) ctx.lineTo(c.x*W, c.y*H);
      });
      ctx.stroke(); ctx.setLineDash([]);
    });

    // 고객 노드
    const icons = { internet:"I", iptv:"T", combo:"C" };
    customers.forEach(c => {
      const cx = c.x*W, cy = c.y*H;
      const a  = aMap[c.id];
      ctx.beginPath(); ctx.arc(cx,cy, c.vip?7:5, 0, Math.PI*2);
      ctx.fillStyle = a ? a.worker.color : "#444"; ctx.fill();
      if (c.vip) { ctx.strokeStyle="#f59e0b"; ctx.lineWidth=2; ctx.stroke(); }
      ctx.fillStyle="#fff"; ctx.font="7px system-ui";
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText(icons[c.svc], cx, cy);
    });

    // 작업자 마커
    workers.forEach(w => {
      const wx=w.x*W, wy=w.y*H;
      ctx.beginPath(); ctx.arc(wx,wy,9,0,Math.PI*2);
      ctx.fillStyle=w.color; ctx.fill();
      ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle="#fff"; ctx.font="bold 8px system-ui";
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText(w.name[0], wx, wy);
      ctx.fillStyle=w.color; ctx.font="10px system-ui";
      ctx.fillText(w.name, wx, wy+16);
    });
    ctx.textAlign="left";
  }, [workers, customers, assignments]);

  return (
    <div style={{position:"relative", background:"#141720", borderRadius:10, overflow:"hidden", border:"1px solid #2e3250"}}>
      <canvas ref={canvasRef} width={680} height={400} style={{width:"100%",height:"auto",display:"block"}} />
      <div style={{position:"absolute",top:12,right:12,background:"rgba(15,17,23,.9)",border:"1px solid #2e3250",borderRadius:8,padding:"10px 12px"}}>
        {workers.map(w => (
          <div key={w.id} style={{display:"flex",alignItems:"center",gap:7,fontSize:11,color:"#8b91b5",marginBottom:4}}>
            <div style={{width:16,height:3,background:w.color,borderRadius:2}} />
            {w.name}
          </div>
        ))}
        <div style={{display:"flex",alignItems:"center",gap:7,fontSize:11,color:"#8b91b5",marginTop:6}}>
          <div style={{width:10,height:10,borderRadius:"50%",border:"2px solid #f59e0b"}} />
          VIP 고객
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7,fontSize:11,color:"#8b91b5"}}>
          <span style={{fontSize:9,fontFamily:"monospace",color:"#8b91b5"}}>I/T/C</span>
          인터넷/IPTV/결합
        </div>
        <div style={{borderTop:"1px solid #2e3250",marginTop:8,paddingTop:8}}>
          {Object.entries(REGIONS).map(([key,r]) => (
            <div key={key} style={{display:"flex",alignItems:"center",gap:7,fontSize:11,color:"#9db4ff",marginBottom:3}}>
              <div style={{width:10,height:10,borderRadius:"50%",border:"1.5px dashed #9db4ff"}} />
              {key}구역 · {r.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
