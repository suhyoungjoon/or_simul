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
    <Card className="bg-surface border-border text-gray-200">
      <CardHeader>
        <CardTitle className="text-base">작업자별 필터</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <button
          onClick={() => setSelectedWorker(null)}
          className={`w-full text-left px-3 py-1.5 rounded text-sm ${selectedWorkerId === null ? "bg-accent text-white" : "hover:bg-background"}`}
        >
          전체 보기
        </button>
        {workers.map((w) => (
          <button
            key={w.id}
            onClick={() => setSelectedWorker(selectedWorkerId === w.id ? null : w.id)}
            className={`w-full flex items-center justify-between px-3 py-1.5 rounded text-sm ${selectedWorkerId === w.id ? "bg-accent text-white" : "hover:bg-background"}`}
          >
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: w.color }} />
              {w.name}
            </span>
            <span className="text-xs text-gray-400">{jobCountByWorker[w.id] || 0}건</span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
