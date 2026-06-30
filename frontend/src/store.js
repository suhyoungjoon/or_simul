import { create } from "zustand";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const DEFAULT_CFG = {
  date: new Date().toISOString().slice(0, 10),
  region: "all",
  svc: "all",
  maxJobs: 8,
  routeWeight: 1,
  balanceWeight: 1,
  vip: false,
  as: false,
  overdue: false,
};

export const useStore = create((set, get) => ({
  workers: [],
  customers: [],
  optimizedCustomers: [],
  result: null,
  selectedWorkerId: null,
  lookupAddedIds: new Set(),
  cfg: { ...DEFAULT_CFG },
  loading: false,
  error: null,
  dataLoaded: false,

  loadInitialData: async () => {
    set({ loading: true, error: null });
    try {
      const [wRes, cRes] = await Promise.all([
        fetch(`${API}/workers`),
        fetch(`${API}/customers`),
      ]);
      if (!wRes.ok || !cRes.ok) throw new Error("초기 데이터 조회 실패");
      const workers = await wRes.json();
      const customers = await cRes.json();
      set({ workers, customers, dataLoaded: true, loading: false });
    } catch (e) {
      set({ error: e.message, loading: false, dataLoaded: true });
    }
  },

  mergeCustomer: (customer) => {
    set((state) => {
      const idx = state.customers.findIndex((c) => c.id === customer.id);
      const customers =
        idx === -1
          ? [...state.customers, customer]
          : state.customers.map((c, i) => (i === idx ? customer : c));
      const lookupAddedIds = new Set(state.lookupAddedIds);
      lookupAddedIds.add(customer.id);
      return { customers, lookupAddedIds };
    });
  },

  runOptimize: async () => {
    const { cfg, customers, workers } = get();
    set({ loading: true, error: null });
    try {
      const filteredCustomers = customers.filter(
        (c) =>
          (cfg.region === "all" || c.region === cfg.region) &&
          (cfg.svc === "all" || c.svc === cfg.svc)
      );
      const res = await fetch(`${API}/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workers: workers,
          customers: filteredCustomers,
          constraints: {
            max_jobs: cfg.maxJobs,
            route_weight: cfg.routeWeight,
            balance_weight: cfg.balanceWeight,
            vip_priority: cfg.vip,
            as_reflect: cfg.as,
            overdue_priority: cfg.overdue,
          },
        }),
      });
      if (!res.ok) throw new Error(`서버 오류: ${res.status}`);
      const result = await res.json();
      set({ result, optimizedCustomers: filteredCustomers, loading: false });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },

  setSelectedWorker: (id) => set({ selectedWorkerId: id }),

  updateCfg: (partial) =>
    set((state) => ({ cfg: { ...state.cfg, ...partial } })),
}));
