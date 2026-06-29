import { useState } from "react";

const SVC_LABEL = { internet:'인터넷', iptv:'IPTV', combo:'결합' };

export default function OrderLookup({ apiBase, onAddToOptimization }) {
  const [orderId, setOrderId] = useState("");
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [added,   setAdded]   = useState(false);

  async function handleLookup() {
    if (!orderId.trim()) return;
    setLoading(true); setError(null); setResult(null); setAdded(false);
    try {
      const res = await fetch(`${apiBase}/legacy/orders/${encodeURIComponent(orderId.trim())}`);
      if (!res.ok) throw new Error(`조회 실패 (${res.status})`);
      setResult(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleAdd() {
    if (!result) return;
    onAddToOptimization(result);
    setAdded(true);
  }

  const inputStyle = {
    background:"#232636", border:"1px solid #2e3250", color:"#e8eaf6",
    padding:"8px 10px", borderRadius:6, fontSize:13, flex:1,
  };
  const btnStyle = {
    padding:"8px 16px", background:"#4f6ef7", color:"#fff", border:"none",
    borderRadius:6, fontSize:13, fontWeight:600, cursor:"pointer",
  };

  return (
    <div style={{maxWidth:480}}>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <input
          style={inputStyle}
          placeholder="주문 ID 입력"
          value={orderId}
          onChange={e=>setOrderId(e.target.value)}
          onKeyDown={e=>{ if (e.key === "Enter") handleLookup(); }}
        />
        <button style={btnStyle} onClick={handleLookup} disabled={loading}>
          {loading ? "조회 중..." : "조회"}
        </button>
      </div>

      {error && (
        <div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",
          borderRadius:8,padding:"10px 14px",color:"#ef4444",fontSize:12,marginBottom:12}}>
          ⚠️ {error}
        </div>
      )}

      {result && (
        <div style={{background:"#1a1d27",border:"1px solid #2e3250",borderRadius:10,padding:16}}>
          <div style={{fontSize:14,fontWeight:600,marginBottom:8}}>{result.name}{result.vip ? " ⭐" : ""}</div>
          <div style={{fontSize:12,color:"#8b91b5",lineHeight:1.6}}>
            <div>주문 ID: {result.id}</div>
            <div>서비스: {SVC_LABEL[result.svc] || result.svc}</div>
            <div>구역: {result.region}</div>
            <div>희망 시간대: {result.time_window === "morning" ? "오전" : "오후"}</div>
            <div>연체 여부: {result.overdue ? "예" : "아니오"}</div>
          </div>
          <button
            style={{...btnStyle, marginTop:12, width:"100%",
              background: added ? "#22c55e" : "#4f6ef7"}}
            onClick={handleAdd}
            disabled={added}
          >
            {added ? "✓ 추가됨" : "최적화 대상에 추가"}
          </button>
        </div>
      )}
    </div>
  );
}
