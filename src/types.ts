export type Side = "LONG" | "SHORT";
export type TradeStatus = "OPEN" | "CLOSED";

export interface Trade {
  id: string;
  symbol: string;
  side: Side;
  strategy: string;
  entry: number;
  mark: number;
  size: number;
  leverage: number;
  pnl: number;
  pnlPct: number;
  confidence: number;
  openedAt: number;
  status: TradeStatus;
  tpPrice?: number | null;
  slPrice?: number | null;
}

export interface StrategySignal {
  id: string;
  name: string;
  weight: number;
  bias: number;       // -1..1 (short..long)
  active: boolean;
  description: string;
  pnl24h: number;
  confidence: number; // 0..1 — how certain the signal is
}

export interface EngineState {
  online: boolean;
  thinking: boolean;
  speaking: boolean;
  equity: number;
  startEquity: number;
  dayPnl: number;
  dayPnlPct: number;
  winRate: number | null;
  sharpe: number | null;
  profitFactor: number | null;
  maxDrawdown: number | null;
  trades: Trade[];
  strategies: StrategySignal[];
  log: HenryThought[];
  marketRegime: "RISK-ON" | "RISK-OFF" | "CHOPPY" | "TRENDING";
  equityHistory: number[];
  signalsUpdatedAt: number | null;
}

export interface HenryThought {
  id: string;
  at: number;
  text: string;
  tone: "info" | "buy" | "sell" | "alert";
}

// ── Signal types (from /api/signals) ──────────────────────────────────────

export interface StrategyBias {
  bias: number;       // -1..1
  confidence: number; // 0..1
}

export interface InstrumentSignal {
  momentum:  StrategyBias;
  meanrev:   StrategyBias;
  breakout:  StrategyBias;
  arb:       StrategyBias;
  sentiment: StrategyBias;
  vol:       StrategyBias;
  aggregate: number;
  regime:    "RISK-ON" | "RISK-OFF" | "CHOPPY" | "TRENDING";
  atr:       number | null;
  atrPct:    number | null;
}

export interface SignalsResponse {
  signals: Record<string, InstrumentSignal>;
  computedAt: number;
}

// ── Performance stats (from /api/performance) ─────────────────────────────

export interface PerformanceStats {
  totalTrades: number;
  winRate: number | null;
  profitFactor: number | null;
  sharpe: number | null;
  maxDrawdown: number | null;
  strategyPerf: Record<string, { wins: number; losses: number; pnl: number }>;
}

// ── Backtesting ────────────────────────────────────────────────────────────

export interface BacktestConfig {
  strategyId: string;
  symbol: string;
  days: number;
  riskPct: number;
  tpAtr: number;
  slAtr: number;
  initialEquity: number;
}

export interface BacktestTrade {
  entryAt: number;
  exitAt: number;
  side: Side;
  entry: number;
  exit: number;
  pnl: number;
  pnlPct: number;
  result: "WIN" | "LOSS" | "BE";
  barsHeld: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  trades: BacktestTrade[];
  equityHistory: number[];
  winRate: number;
  profitFactor: number;
  sharpe: number;
  maxDrawdown: number;
  totalReturn: number;
  totalReturnPct: number;
  avgBarsHeld: number;
  calmar: number;
}
