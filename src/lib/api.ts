import type { Trade, SignalsResponse, PerformanceStats } from "@/types";

const BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:8787";

export interface Health {
  ok: boolean;
  configured: boolean;
  environment: "practice" | "live";
  live: boolean;
  tradingEnabled: boolean;
  maxDdPct?: number;
}

export interface AccountSummary {
  currency: string;
  equity: number;
  balance: number;
  unrealizedPL: number;
  realizedPL: number;
  marginUsed: number;
  marginAvailable: number;
  openTradeCount: number;
  openPositionCount: number;
  environment: "practice" | "live";
}

export interface Candle {
  time: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  base: BASE,

  health: (signal?: AbortSignal) =>
    req<Health>("/api/health", { signal }),

  account: (signal?: AbortSignal) =>
    req<AccountSummary>("/api/account", { signal }),

  trades: (signal?: AbortSignal) =>
    req<Trade[]>("/api/trades", { signal }),

  /** Fetch real technical signals for all live instruments. */
  signals: (instruments?: string[], signal?: AbortSignal) => {
    const qs = instruments && instruments.length > 0
      ? `?instruments=${instruments.map(i => i.replace("/", "_")).join(",")}`
      : "";
    return req<SignalsResponse>(`/api/signals${qs}`, { signal });
  },

  /** Real performance stats from closed OANDA trades. */
  performance: (signal?: AbortSignal) =>
    req<PerformanceStats>("/api/performance", { signal }),

  /** Raw candles for backtesting / charting. */
  candles: (instrument: string, granularity = "H1", count = 500, signal?: AbortSignal) =>
    req<{ instrument: string; granularity: string; candles: Candle[] }>(
      `/api/candles?instrument=${encodeURIComponent(instrument)}&granularity=${granularity}&count=${count}`,
      { signal }
    ),

  placeOrder: (body: {
    instrument: string;
    units?: number;
    side?: "LONG" | "SHORT";
    riskPct?: number;
    strategy?: string;
    confidence?: number;
    takeProfitPct?: number | null;
    stopLossPct?: number | null;
    atrValue?: number | null;
    tpAtrMult?: number | null;
    slAtrMult?: number | null;
  }) => req("/api/order", { method: "POST", body: JSON.stringify(body) }),

  flatten: () =>
    req<{ requested: number; closed: number; failed: number }>("/api/flatten", {
      method: "POST",
    }),

  setBrackets: (
    id: string,
    body: {
      takeProfitPct?: number;
      stopLossPct?: number;
      takeProfit?: number;
      stopLoss?: number;
      atrValue?: number;
      tpAtrMult?: number;
      slAtrMult?: number;
    }
  ) => req(`/api/trades/${id}/brackets`, { method: "PUT", body: JSON.stringify(body) }),

  closeTrade: (id: string) =>
    req(`/api/trades/${id}/close`, { method: "PUT" }),
};
