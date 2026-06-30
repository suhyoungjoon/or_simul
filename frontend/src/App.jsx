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
    <div className="h-full w-full flex bg-background text-foreground">
      <aside className="w-72 p-4 space-y-4 overflow-y-auto border-r border-border/50 bg-muted/30">
        <SidePanel />
        <WorkerFilterList />
      </aside>

      <main className="flex-1 p-4 overflow-y-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2 mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!dataLoaded && <div className="text-muted-foreground">데이터 로딩 중...</div>}

        {dataLoaded && tab === "map" && <MapView />}
        {dataLoaded && tab === "timeline" && <Timeline />}
        {dataLoaded && tab === "table" && <AssignTable />}
        {dataLoaded && tab === "log" && (
          <>
            <div className="bg-muted/50 border border-border/50 rounded-lg p-3 font-mono text-xs text-muted-foreground max-h-80 overflow-y-auto">
              {logs.length === 0 && (
                <div>최적화를 실행하면 로그가 표시됩니다.</div>
              )}
              {logs.map((l, i) => (
                <div key={i} style={{marginBottom:4,lineHeight:1.5}}>
                  <span className="text-muted-foreground/60">[{l.time}]</span>{" "}
                  <span style={{color:logColors[l.type]}}>{l.msg}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-muted-foreground/60 px-0.5">
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
