import { useStore } from "../store";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";

const STRENGTH = ["약", "중", "강", "최강"];

export default function SidePanel() {
  const cfg = useStore((s) => s.cfg);
  const updateCfg = useStore((s) => s.updateCfg);
  const runOptimize = useStore((s) => s.runOptimize);
  const loading = useStore((s) => s.loading);

  return (
    <Card className="border-border/50 shadow-none">
      <CardHeader>
        <CardTitle className="text-base">최적화 설정</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">날짜</label>
          <input
            type="date"
            value={cfg.date}
            onChange={(e) => updateCfg({ date: e.target.value })}
            className="w-full bg-background border border-input rounded px-2 py-1.5 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">구역</label>
          <Select value={cfg.region} onValueChange={(v) => updateCfg({ region: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="A">A · 강남/서초</SelectItem>
              <SelectItem value="B">B · 송파/강동</SelectItem>
              <SelectItem value="C">C · 마포/서대문</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">서비스</label>
          <Select value={cfg.svc} onValueChange={(v) => updateCfg({ svc: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="internet">인터넷</SelectItem>
              <SelectItem value="iptv">IPTV</SelectItem>
              <SelectItem value="combo">결합</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">작업자당 최대 건수: {cfg.maxJobs}</label>
          <Slider min={1} max={15} step={1} value={[cfg.maxJobs]} onValueChange={([v]) => updateCfg({ maxJobs: v })} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">동선 최적화 강도: {STRENGTH[cfg.routeWeight]}</label>
          <Slider min={0} max={3} step={1} value={[cfg.routeWeight]} onValueChange={([v]) => updateCfg({ routeWeight: v })} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">작업량 균형 강도: {STRENGTH[cfg.balanceWeight]}</label>
          <Slider min={0} max={3} step={1} value={[cfg.balanceWeight]} onValueChange={([v]) => updateCfg({ balanceWeight: v })} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm">VIP 우선</span>
          <Switch checked={cfg.vip} onCheckedChange={(v) => updateCfg({ vip: v })} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">AS 가능자만</span>
          <Switch checked={cfg.as} onCheckedChange={(v) => updateCfg({ as: v })} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">연체 우선</span>
          <Switch checked={cfg.overdue} onCheckedChange={(v) => updateCfg({ overdue: v })} />
        </div>

        <Button className="w-full" disabled={loading} onClick={runOptimize}>
          {loading ? "최적화 중..." : "최적화 실행"}
        </Button>
      </CardContent>
    </Card>
  );
}
