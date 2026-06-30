import { useStore } from "../store";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export default function WorkerFilterList() {
  const workers = useStore((s) => s.workers);
  const result = useStore((s) => s.result);
  const selectedWorkerId = useStore((s) => s.selectedWorkerId);
  const setSelectedWorker = useStore((s) => s.setSelectedWorker);

  const assignments = result?.assignments || [];
  const jobCountByWorker = Object.fromEntries(
    workers.map((w) => [w.id, assignments.filter((a) => a.worker_id === w.id).length])
  );

  return (
    <Card className="border-0 ring-0 shadow-none">
      <CardHeader>
        <CardTitle className="text-base">작업자별 필터</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <button
          onClick={() => setSelectedWorker(null)}
          className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${selectedWorkerId === null ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
        >
          전체 보기
        </button>
        {workers.map((w) => (
          <button
            key={w.id}
            onClick={() => setSelectedWorker(selectedWorkerId === w.id ? null : w.id)}
            className={`w-full flex items-center justify-between px-3 py-1.5 rounded text-sm transition-colors ${selectedWorkerId === w.id ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
          >
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: w.color }} />
              {w.name}
            </span>
            <span className="text-xs text-muted-foreground">{jobCountByWorker[w.id] || 0}건</span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
