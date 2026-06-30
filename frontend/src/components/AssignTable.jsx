import { useStore } from "../store";
import { Badge } from "./ui/badge";
import { SVC_LABEL } from "../utils/dataGenerator";

export default function AssignTable() {
  const workers = useStore((s) => s.workers);
  const customers = useStore((s) => s.customers);
  const optimizedCustomers = useStore((s) => s.optimizedCustomers);
  const result = useStore((s) => s.result);
  const selectedWorkerId = useStore((s) => s.selectedWorkerId);
  const lookupAddedIds = useStore((s) => s.lookupAddedIds);

  const displayCustomers = optimizedCustomers.length ? optimizedCustomers : customers;
  const wMap = Object.fromEntries(workers.map((w) => [w.id, w]));
  const assignments = (result?.assignments || []).filter(
    (a) => !selectedWorkerId || a.worker_id === selectedWorkerId
  );

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm text-gray-200">
        <thead className="bg-background text-gray-400">
          <tr>
            <th className="px-3 py-2 text-left">작업자</th>
            <th className="px-3 py-2 text-left">고객</th>
            <th className="px-3 py-2 text-left">서비스</th>
            <th className="px-3 py-2 text-left">구역</th>
            <th className="px-3 py-2 text-left">시작</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => {
            const c = displayCustomers.find((c) => c.id === a.customer_id);
            const w = wMap[a.worker_id];
            return (
              <tr key={a.customer_id} className="border-t border-border">
                <td className="px-3 py-2">{w?.name}</td>
                <td className="px-3 py-2 flex items-center gap-2">
                  {c?.name}
                  {lookupAddedIds.has(a.customer_id) && (
                    <Badge variant="outline" className="text-cyan-400 border-cyan-400">🔍 온디맨드 조회</Badge>
                  )}
                  {c?.vip && <Badge className="bg-amber-500">VIP</Badge>}
                </td>
                <td className="px-3 py-2">{c ? SVC_LABEL[c.svc] : "-"}</td>
                <td className="px-3 py-2">{c?.address || c?.region}</td>
                <td className="px-3 py-2">{a.start_min != null ? `${Math.floor(a.start_min / 60)}:${String(a.start_min % 60).padStart(2, "0")}` : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
