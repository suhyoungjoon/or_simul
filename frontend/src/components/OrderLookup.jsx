import { useState } from "react";
import { useStore } from "../store";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { SVC_LABEL } from "../utils/dataGenerator";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function OrderLookup() {
  const mergeCustomer = useStore((s) => s.mergeCustomer);
  const [orderId, setOrderId] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);

  const handleLookup = async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAdded(false);
    try {
      const res = await fetch(`${API}/legacy/orders/${orderId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("해당 주문번호를 찾을 수 없습니다");
        if (res.status === 503) throw new Error("레거시 시스템에 연결할 수 없습니다");
        throw new Error("조회 중 오류가 발생했습니다");
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    if (!result) return;
    mergeCustomer(result);
    setAdded(true);
  };

  return (
    <Card className="border-border/50 shadow-none max-w-md">
      <CardHeader>
        <CardTitle className="text-base">🔍 온디맨드 주문 조회</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="주문번호 (예: 101)"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLookup()}
          />
          <Button onClick={handleLookup} disabled={loading}>
            {loading ? "조회 중..." : "조회"}
          </Button>
        </div>

        {error && <div className="text-sm text-red-500">{error}</div>}

        {result && (
          <div className="border border-border/50 rounded-lg p-3 space-y-1 text-sm bg-muted/30">
            <div className="font-bold">{result.name}</div>
            <div className="text-muted-foreground">{result.address}</div>
            <div className="flex gap-2 items-center">
              <Badge variant="outline">{SVC_LABEL[result.svc]}</Badge>
              {result.vip && <Badge className="bg-amber-500">VIP</Badge>}
              {result.overdue && <Badge variant="destructive">연체</Badge>}
            </div>
            <Button size="sm" className="mt-2" disabled={added} onClick={handleAdd}>
              {added ? "추가됨" : "최적화 대상에 추가"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
