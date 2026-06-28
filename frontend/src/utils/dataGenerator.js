export const WORKER_NAMES  = ['김민준','이서연','박지훈','최수아','정도현','한예지','오승현','윤채원'];
export const WORKER_COLORS = ['#4f6ef7','#22c55e','#f59e0b','#ef4444','#06b6d4','#7c5cfc','#f97316','#ec4899'];
export const SVC_LABEL     = { internet:'인터넷', iptv:'IPTV', combo:'결합' };
export const SVC_TIME      = { internet:60, iptv:90, combo:150 };

const REGIONS = {
  A: { cx:0.55, cy:0.55, r:0.25 },
  B: { cx:0.75, cy:0.65, r:0.22 },
  C: { cx:0.25, cy:0.40, r:0.22 },
};

const SVC_POOL = ['internet','internet','internet','iptv','combo','combo'];
const rand     = (a,b) => a + Math.random()*(b-a);
const randInt  = (a,b) => Math.floor(a + Math.random()*(b-a+1));

export function generateWorkers(n) {
  return Array.from({length:n}, (_,i) => ({
    id: i,
    name: WORKER_NAMES[i % WORKER_NAMES.length],
    color: WORKER_COLORS[i % WORKER_COLORS.length],
    x: rand(0.08, 0.92),
    y: rand(0.08, 0.92),
    can_iptv: Math.random() > 0.3,
    as_rate: parseFloat(rand(0.03,0.18).toFixed(2)),
    region: ['A','B','C'][i % 3],
  }));
}

export function generateCustomers(n, regionFilter='all', svcFilter='all') {
  return Array.from({length:n}, (_,i) => {
    const svc = svcFilter === 'all' ? SVC_POOL[randInt(0,SVC_POOL.length-1)] : svcFilter;
    const reg = regionFilter === 'all' ? ['A','B','C'][randInt(0,2)] : regionFilter;
    const R   = REGIONS[reg];
    const angle = Math.random() * Math.PI * 2;
    const r     = Math.random() * R.r;
    return {
      id: i,
      name: `고객${String(i+1).padStart(2,'0')}`,
      x: Math.min(.95, Math.max(.05, R.cx + Math.cos(angle)*r)),
      y: Math.min(.95, Math.max(.05, R.cy + Math.sin(angle)*r)),
      svc, region: reg,
      time_window: Math.random() > .5 ? 'morning' : 'afternoon',
      vip:     Math.random() > 0.8,
      overdue: Math.random() > 0.85,
    };
  });
}
