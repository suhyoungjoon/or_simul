import { useEffect, useState } from "react";
import { useStore } from "./store";
import SidePanel from "./components/SidePanel";
import MapView from "./components/MapView";
import AssignTable from "./components/AssignTable";
import WorkerFilterList from "./components/WorkerFilterList";
import Timeline from "./components/Timeline";
import OrderLookup from "./components/OrderLookup";

const TABS = [
  { key: "map", label: "지도" },
  { key: "timeline", label: "타임라인" },
  { key: "table", label: "배정목록" },
  { key: "log", label: "최적화 로그" },
  { key: "lookup", label: "🔍 주문 조회" },
];

const logColors = { ok: "#22c55e", info: "#06b6d4", warn: "#f59e0b", error: "#ef4444" };

export default function App() {
  const [tab, setTab] = useState("map");
  const loadInitialData = useStore((s) => s.loadInitialData);
  const dataLoaded = useStore((s) => s.dataLoaded);
  const error = useStore((s) => s.error);
  const result = useStore((s) => s.result);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const logs = result?.logs ?? [];

  return (
    <div className="h-full w-full flex bg-background text-gray-100">
      <aside className="w-72 p-4 space-y-4 overflow-y-auto border-r border-border">
        <SidePanel />
        <WorkerFilterList />
      </aside>

      <main className="flex-1 p-4 overflow-y-auto">
        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-300 rounded-lg px-4 py-2 mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded text-sm ${tab === t.key ? "bg-accent text-white" : "bg-surface text-gray-400 hover:text-gray-200"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!dataLoaded && <div className="text-gray-400">데이터 로딩 중...</div>}

        {dataLoaded && tab === "map" && <MapView />}
        {dataLoaded && tab === "timeline" && <Timeline />}
        {dataLoaded && tab === "table" && <AssignTable />}
        {dataLoaded && tab === "log" && (
          <>
            <div style={{background:"#1a1d27",border:"1px solid #2e3250",borderRadius:10,
              padding:"12px 14px",fontFamily:"monospace",fontSize:11,
              color:"#8b91b5",maxHeight:320,overflowY:"auto"}}>
              {logs.length === 0 && (
                <div className="text-gray-500">최적화를 실행하면 로그가 표시됩니다.</div>
              )}
              {logs.map((l, i) => (
                <div key={i} style={{marginBottom:4,lineHeight:1.5}}>
                  <span style={{color:"#5a6085"}}>[{l.time}]</span>{" "}
                  <span style={{color:logColors[l.type]||"#8b91b5"}}>{l.msg}</span>
                </div>
              ))}
            </div>
            <div style={{marginTop:14,color:"#5a6085",fontSize:11,padding:"0 2px"}}>
              실제 OR-Tools(VRPTW 솔버)는 이 과정을 수리 최적화로 수행합니다.<br/>
              이 데모는 스코어링 기반 근사 알고리즘으로 동일한 개념을 시뮬레이션합니다.
            </div>
          </>
        )}
        {dataLoaded && tab === "lookup" && <OrderLookup />}
      </main>
    </div>
  );
}
