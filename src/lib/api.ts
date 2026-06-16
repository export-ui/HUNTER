import type { Trade } from "@/types";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:8787";

export interface Health {
  ok: boolean;
  configured: boolean;
  environment: "practice" | "live";
  live: boolean;
  tradingEnabled: boolean;
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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  base: BASE,
  health: (signal?: AbortSignal) => req<Health>("/api/health", { signal }),
  account: (signal?: AbortSignal) => req<AccountSummary>("/api/account", { signal }),
  trades: (signal?: AbortSignal) => req<Trade[]>("/api/trades", { signal }),
  placeOrder: (body: {
    instrument: string;
    units: number;
    strategy?: string;
    confidence?: number;
  }) => req("/api/order", { method: "POST", body: JSON.stringify(body) }),
  closeTrade: (id: string) => req(`/api/trades/${id}/close`, { method: "PUT" }),
};
