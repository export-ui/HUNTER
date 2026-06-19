import type { StrategySignal } from "@/types";

/**
 * The Rift Hunter ensemble. Henry runs all of these simultaneously and
 * blends their conviction — weighted by real-time confidence — into a
 * single directional decision per instrument.
 *
 * In live mode, biases and confidence values are overwritten every 60 s
 * by real EMA/RSI/ATR/Bollinger/MACD signals computed from OANDA candles.
 * In sim mode, they evolve slowly and mean-revert to prevent random drift.
 */
export const STRATEGY_CATALOG: Omit<StrategySignal, "bias" | "pnl24h" | "confidence">[] = [
  {
    id: "momentum",
    name: "Quantum Momentum",
    weight: 0.22,
    active: true,
    description: "EMA(8/21) crossover + MACD histogram confirmation. Rides multi-timeframe trend bursts.",
  },
  {
    id: "meanrev",
    name: "Mean Reversion",
    weight: 0.16,
    active: true,
    description: "Bollinger Band %B + RSI extremes. Fades statistical outliers back to the VWAP mean.",
  },
  {
    id: "breakout",
    name: "Liquidity Breakout",
    weight: 0.18,
    active: true,
    description: "20-period high/low breakout confirmed by ATR expansion. Hunts momentum after range compression.",
  },
  {
    id: "arb",
    name: "Cross-Venue Arb",
    weight: 0.12,
    active: true,
    description: "Short-vs-medium EMA momentum dislocation. Fades temporary divergences back to trend.",
  },
  {
    id: "sentiment",
    name: "Neural Sentiment",
    weight: 0.17,
    active: true,
    description: "Candle pattern recognition (engulfing, hammer, shooting star) + RSI trend confirmation.",
  },
  {
    id: "vol",
    name: "Volatility Harvest",
    weight: 0.15,
    active: true,
    description: "ATR ratio vs historical baseline. Trades with trend in elevated vol; fades compression.",
  },
];

/** Instruments available in sim mode (with reference prices and daily vol). */
export const SYMBOLS = [
  { symbol: "BTC/USDT", price: 67420,  vol: 0.018 },
  { symbol: "ETH/USDT", price: 3540,   vol: 0.022 },
  { symbol: "SOL/USDT", price: 168.4,  vol: 0.035 },
  { symbol: "XAU/USD",  price: 2348,   vol: 0.008 },
  { symbol: "NVDA",     price: 124.6,  vol: 0.025 },
  { symbol: "EUR/USD",  price: 1.0824, vol: 0.005 },
  { symbol: "GBP/USD",  price: 1.2710, vol: 0.006 },
  { symbol: "USD/JPY",  price: 151.40, vol: 0.005 },
];
