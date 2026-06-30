import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useStore } from "../store";
import { SVC_LABEL } from "../utils/dataGenerator";

const REGION_META = {
  A: { name: "강남/서초", center: [37.4979, 127.0276] },
  B: { name: "송파/강동", center: [37.5145, 127.1058] },
  C: { name: "마포/서대문", center: [37.5599, 126.9249] },
};
const REGION_RADIUS_M = 1500;
const SEOUL_CENTER = [37.5326, 127.0184];

export default function MapView() {
  const workers = useStore((s) => s.workers);
  const result = useStore((s) => s.result);
  const optimizedCustomers = useStore((s) => s.optimizedCustomers);
  const customers = useStore((s) => s.customers);
  const selectedWorkerId = useStore((s) => s.selectedWorkerId);
  const lookupAddedIds = useStore((s) => s.lookupAddedIds);

  const displayCustomers = optimizedCustomers.length ? optimizedCustomers : customers;
  const assignments = result?.assignments || [];
  const wMap = Object.fromEntries(workers.map((w) => [w.id, w]));
  const aMap = Object.fromEntries(assignments.map((a) => [a.customer_id, { worker: wMap[a.worker_id], ...a }]));

  const routes = {};
  workers.forEach((w) => { routes[w.id] = []; });
  assignments.forEach((a) => routes[a.worker_id]?.push(a));

  const visibleWorkers = selectedWorkerId ? workers.filter((w) => w.id === selectedWorkerId) : workers;
  const visibleCustomerIds = selectedWorkerId
    ? new Set(assignments.filter((a) => a.worker_id === selectedWorkerId).map((a) => a.customer_id))
    : null;

  return (
    <div className="relative rounded-lg overflow-hidden border border-border bg-background">
      <MapContainer center={SEOUL_CENTER} zoom={12} style={{ height: 480, width: "100%" }}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        {Object.entries(REGION_META).map(([key, r]) => (
          <Circle
            key={key}
            center={r.center}
            radius={REGION_RADIUS_M}
            pathOptions={{ color: "#9db4ff", dashArray: "6,4", fillOpacity: 0.05 }}
          >
            <Popup>{key}구역 · {r.name}</Popup>
          </Circle>
        ))}

        {visibleWorkers.map((w) => {
          const jobs = (routes[w.id] || []).slice().sort((a, b) => a.start_min - b.start_min);
          if (!jobs.length || !w.lat) return null;
          const positions = [[w.lat, w.lng], ...jobs
            .map((j) => displayCustomers.find((c) => c.id === j.customer_id))
            .filter((c) => c && c.lat)
            .map((c) => [c.lat, c.lng])];
          return (
            <Polyline key={w.id} positions={positions} pathOptions={{ color: w.color, weight: 2, dashArray: "4,3", opacity: 0.6 }} />
          );
        })}

        {displayCustomers.filter((c) => c.lat && (!visibleCustomerIds || visibleCustomerIds.has(c.id))).map((c) => {
          const a = aMap[c.id];
          const color = a ? a.worker.color : "#aaaaaa";
          const isLookup = lookupAddedIds.has(c.id);
          return (
            <CircleMarker
              key={c.id}
              center={[c.lat, c.lng]}
              radius={c.vip ? 8 : 6}
              pathOptions={{
                color: c.vip ? "#f59e0b" : isLookup ? "#67dff0" : color,
                weight: c.vip || isLookup ? 2 : 1,
                fillColor: color,
                fillOpacity: 0.85,
                dashArray: isLookup ? "2,2" : undefined,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-bold">{c.name}</div>
                  <div>{c.address}</div>
                  <div>{SVC_LABEL[c.svc]}</div>
                  <div>{c.region}구역</div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {visibleWorkers.filter((w) => w.lat).map((w) => (
          <CircleMarker key={w.id} center={[w.lat, w.lng]} radius={10} pathOptions={{ color: "#fff", weight: 2, fillColor: w.color, fillOpacity: 1 }}>
            <Popup>{w.name}</Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className="absolute top-3 right-3 bg-background/90 border border-border/50 rounded-lg p-3 text-xs text-foreground shadow-sm space-y-1 max-w-[180px]">
        {workers.map((w) => (
          <div key={w.id} className="flex items-center gap-2">
            <span className="w-4 h-[3px] rounded" style={{ background: w.color }} />
            {w.name}
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: "#f59e0b" }} />
          VIP 고객
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full border" style={{ borderColor: "#67dff0", borderStyle: "dashed" }} />
          🔍 온디맨드 조회로 추가됨
        </div>
        <div className="border-t border-border/50 pt-2 mt-1 space-y-1">
          {Object.entries(REGION_META).map(([key, r]) => (
            <div key={key} className="flex items-center gap-2 text-[#9db4ff]">
              <span className="w-3 h-3 rounded-full border" style={{ borderColor: "#9db4ff", borderStyle: "dashed" }} />
              {key}구역 · {r.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
