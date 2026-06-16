export type Side = "LONG" | "SHORT";
export type TradeStatus = "OPEN" | "CLOSED";

export interface Trade {
  id: string;
  symbol: string;
  side: Side;
  strategy: string;
  entry: number;
  mark: number;
  size: number; // position size in USD
  leverage: number;
  pnl: number; // unrealized USD
  pnlPct: number;
  confidence: number; // 0..1 AI conviction
  openedAt: number;
  status: TradeStatus;
  tpPrice?: number | null; // OANDA take-profit (server-side bracket)
  slPrice?: number | null; // OANDA stop-loss (server-side bracket)
}

export interface StrategySignal {
  id: string;
  name: string;
  weight: number; // contribution to the ensemble 0..1
  bias: number; // -1..1 (short..long)
  active: boolean;
  description: string;
  pnl24h: number;
}

export interface EngineState {
  online: boolean;
  thinking: boolean;
  speaking: boolean;
  equity: number;
  startEquity: number;
  dayPnl: number;
  dayPnlPct: number;
  winRate: number;
  sharpe: number;
  trades: Trade[];
  strategies: StrategySignal[];
  log: HenryThought[];
  marketRegime: "RISK-ON" | "RISK-OFF" | "CHOPPY" | "TRENDING";
}

export interface HenryThought {
  id: string;
  at: number;
  text: string;
  tone: "info" | "buy" | "sell" | "alert";
}
