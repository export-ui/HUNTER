import type { StrategySignal } from "@/types";

/**
 * The Rift Hunter ensemble. Henry runs every one of these at once and
 * blends their conviction into a single decision per asset — "the best
 * strategies in the world, all at once."
 */
export const STRATEGY_CATALOG: Omit<StrategySignal, "bias" | "pnl24h">[] = [
  {
    id: "momentum",
    name: "Quantum Momentum",
    weight: 0.22,
    active: true,
    description: "Rides multi-timeframe trend bursts with adaptive position sizing.",
  },
  {
    id: "meanrev",
    name: "Mean Reversion",
    weight: 0.16,
    active: true,
    description: "Fades statistical extremes back toward the volume-weighted mean.",
  },
  {
    id: "breakout",
    name: "Liquidity Breakout",
    weight: 0.18,
    active: true,
    description: "Hunts order-book imbalances at key levels for explosive moves.",
  },
  {
    id: "arb",
    name: "Cross-Venue Arb",
    weight: 0.12,
    active: true,
    description: "Captures price dislocations across exchanges in milliseconds.",
  },
  {
    id: "sentiment",
    name: "Neural Sentiment",
    weight: 0.17,
    active: true,
    description: "Reads news & social flow with a transformer to front-run crowds.",
  },
  {
    id: "vol",
    name: "Volatility Harvest",
    weight: 0.15,
    active: true,
    description: "Sells rich implied vol and buys cheap convexity around events.",
  },
];

export const SYMBOLS = [
  { symbol: "BTC/USDT", price: 67420, vol: 0.018 },
  { symbol: "ETH/USDT", price: 3540, vol: 0.022 },
  { symbol: "SOL/USDT", price: 168.4, vol: 0.035 },
  { symbol: "XAU/USD", price: 2348, vol: 0.008 },
  { symbol: "NVDA", price: 124.6, vol: 0.025 },
  { symbol: "EUR/USD", price: 1.0824, vol: 0.005 },
];
