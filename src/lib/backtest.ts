/**
 * Rift Hunter — client-side backtesting engine.
 *
 * Generates realistic synthetic price series (GBM + regime switching) and
 * runs each strategy's signal logic against it, applying proper TP/SL
 * brackets and risk-based position sizing. Returns a full performance report.
 *
 * This is used to validate strategies before live deployment and to give the
 * user a backtested equity curve with real statistics.
 */

import type { BacktestConfig, BacktestResult, BacktestTrade, Side } from "@/types";

// ── Deterministic PRNG (Mulberry32) ────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Technical indicators (pure functions, same logic as server) ────────────

function ema(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let val = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) val = closes[i] * k + val * (1 - k);
  return val;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function atr(candles: { h: number; l: number; c: number }[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { h, l } = candles[i];
    const pc = candles[i - 1].c;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let val = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) val = (val * (period - 1) + trs[i]) / period;
  return val;
}

function bollingerBands(closes: number[], period = 20, mult = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const upper = mean + mult * std;
  const lower = mean - mult * std;
  const price = closes[closes.length - 1];
  const pctB = std > 0 ? (price - lower) / (upper - lower) : 0.5;
  return { upper, mid: mean, lower, pctB, bandwidth: std > 0 ? (upper - lower) / mean : 0 };
}

function macdIndicator(closes: number[]) {
  if (closes.length < 35) return null;
  const kf = 2 / 13, ks = 2 / 27, ksg = 2 / 10;
  let ef = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  for (let i = 12; i < 26; i++) ef = closes[i] * kf + ef * (1 - kf);
  let es = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
  const macdLine: number[] = [];
  for (let i = 26; i < closes.length; i++) {
    ef = closes[i] * kf + ef * (1 - kf);
    es = closes[i] * ks + es * (1 - ks);
    macdLine.push(ef - es);
  }
  if (macdLine.length < 9) return null;
  let sv = macdLine.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  for (let i = 9; i < macdLine.length; i++) sv = macdLine[i] * ksg + sv * (1 - ksg);
  const last = macdLine[macdLine.length - 1];
  return { macd: last, signal: sv, hist: last - sv };
}

// ── Strategy signal functions (mirrors server logic) ──────────────────────

type Signal = { bias: number; confidence: number };

function momentumSignal(closes: number[]): Signal {
  const e8 = ema(closes, 8), e21 = ema(closes, 21), m = macdIndicator(closes);
  if (e8 === null || e21 === null || !m) return { bias: 0, confidence: 0.3 };
  const emaDiff = (e8 - e21) / e21;
  const emaNorm = Math.tanh(emaDiff * 300);
  const macdDir = m.hist > 0 ? 1 : -1;
  const agree = Math.sign(emaNorm) === macdDir;
  const bias = emaNorm * 0.6 + macdDir * 0.4;
  const confidence = agree
    ? Math.min(0.92, 0.60 + Math.abs(emaNorm) * 0.35)
    : Math.max(0.25, 0.50 - Math.abs(emaNorm) * 0.2);
  return { bias: Math.max(-1, Math.min(1, bias)), confidence };
}

function meanRevSignal(closes: number[]): Signal {
  const bb = bollingerBands(closes);
  const r = rsi(closes);
  if (!bb) return { bias: 0, confidence: 0.3 };
  const oversold   = bb.pctB < 0.15 && r < 30;
  const overbought = bb.pctB > 0.85 && r > 70;
  const mildOS     = bb.pctB < 0.30 && r < 40;
  const mildOB     = bb.pctB > 0.70 && r > 60;
  let bias = (0.5 - bb.pctB) * 2, confidence = 0.35;
  if (oversold)   { bias =  1.0; confidence = Math.min(0.90, 0.72 + bb.bandwidth * 8); }
  else if (overbought) { bias = -1.0; confidence = Math.min(0.90, 0.72 + bb.bandwidth * 8); }
  else if (mildOS) { bias =  0.5; confidence = 0.55; }
  else if (mildOB) { bias = -0.5; confidence = 0.55; }
  return { bias: Math.max(-1, Math.min(1, bias)), confidence };
}

function breakoutSignal(closes: number[], atrValue: number | null): Signal {
  const N = 20;
  if (closes.length < N + 2 || !atrValue) return { bias: 0, confidence: 0.3 };
  const lookback = closes.slice(-N - 1, -1);
  const highest = Math.max(...lookback);
  const lowest  = Math.min(...lookback);
  const current = closes[closes.length - 1];
  const prev    = closes[closes.length - 2];
  if (current > highest && prev <= highest) {
    const strength = Math.min(2, (current - highest) / atrValue);
    return { bias: Math.min(1, 0.65 + strength * 0.2), confidence: Math.min(0.88, 0.60 + strength * 0.15) };
  }
  if (current < lowest && prev >= lowest) {
    const strength = Math.min(2, (lowest - current) / atrValue);
    return { bias: Math.max(-1, -(0.65 + strength * 0.2)), confidence: Math.min(0.88, 0.60 + strength * 0.15) };
  }
  return { bias: 0, confidence: 0.28 };
}

function arbSignal(closes: number[]): Signal {
  const e5 = ema(closes, 5), e10 = ema(closes, 10), e20 = ema(closes, 20);
  if (!e5 || !e10 || !e20) return { bias: 0, confidence: 0.3 };
  const shortMom = (e5 - e10) / e10;
  const medMom   = (e10 - e20) / e20;
  const displace  = shortMom - medMom;
  const bias = Math.tanh(-displace * 800);
  return { bias, confidence: Math.min(0.78, 0.42 + Math.abs(displace) * 400 * 0.15) };
}

function sentimentSignal(closes: number[]): Signal {
  // Client-side proxy: recent candle momentum + RSI divergence
  if (closes.length < 10) return { bias: 0, confidence: 0.35 };
  const r = rsi(closes);
  const shortReturn = (closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5];
  const bias = Math.tanh(shortReturn * 200) * 0.5 + ((r - 50) / 50) * 0.5;
  return { bias: Math.max(-1, Math.min(1, bias)), confidence: Math.min(0.75, 0.40 + Math.abs(bias) * 0.35) };
}

function volHarvestSignal(closes: number[], atrValue: number | null, historicalAtr: number | null): Signal {
  if (!atrValue || !historicalAtr || historicalAtr === 0) return { bias: 0, confidence: 0.3 };
  const r = rsi(closes);
  const trendBias = r > 50 ? 1 : -1;
  const volRatio = atrValue / historicalAtr;
  if (volRatio > 1.6) {
    const strength = Math.min(1, (volRatio - 1) * 0.55);
    return { bias: trendBias * strength, confidence: Math.min(0.80, 0.55 + strength * 0.25) };
  }
  if (volRatio < 0.65) return { bias: 0.2, confidence: 0.50 };
  return { bias: 0, confidence: 0.30 };
}

const STRATEGY_SIGNAL_FNS: Record<
  string,
  (closes: number[], candles: { h: number; l: number; c: number }[]) => Signal
> = {
  momentum: (c) => momentumSignal(c),
  meanrev:  (c) => meanRevSignal(c),
  breakout: (c, k) => breakoutSignal(c, atr(k, 14)),
  arb:      (c) => arbSignal(c),
  sentiment:(c) => sentimentSignal(c),
  vol:      (c, k) => volHarvestSignal(c, atr(k, 14), atr(k.slice(0, Math.floor(k.length / 2)), 14)),
};

// ── Price series generation (GBM + regime switching) ──────────────────────

interface Candle { time: number; o: number; h: number; l: number; c: number }

function generatePriceSeries(days: number, barsPerDay: number, seed: number): Candle[] {
  const r = mulberry32(seed);
  const total = days * barsPerDay;
  const candles: Candle[] = [];

  let price = 1.1000 + r() * 0.5; // starting price
  const dt = 1 / (252 * barsPerDay);
  let mu = 0.00002;            // drift
  let sigma = 0.0008;          // volatility (per bar)
  let regimeTimer = 0;
  const now = Date.now() - total * 15 * 60 * 1000;

  for (let i = 0; i < total; i++) {
    // Regime switching every ~50-200 bars
    regimeTimer--;
    if (regimeTimer <= 0) {
      regimeTimer = 50 + Math.floor(r() * 150);
      const regimeRoll = r();
      if (regimeRoll < 0.35)      { mu =  0.0003; sigma = 0.0006; }  // trending up
      else if (regimeRoll < 0.70) { mu = -0.0003; sigma = 0.0006; }  // trending down
      else if (regimeRoll < 0.85) { mu =  0.0000; sigma = 0.0015; }  // choppy/high vol
      else                        { mu =  0.0001; sigma = 0.0003; }  // low vol grind
    }

    const open = price;
    const ret = mu * dt + sigma * Math.sqrt(dt) * (r() * 2 - 1) * Math.SQRT2;
    const close = Math.max(0.0001, price * (1 + ret));

    const hi = Math.max(open, close) * (1 + Math.abs(r() - 0.5) * sigma * 2);
    const lo = Math.min(open, close) * (1 - Math.abs(r() - 0.5) * sigma * 2);

    candles.push({
      time: now + i * 15 * 60 * 1000,
      o: open,
      h: hi,
      l: lo,
      c: close,
    });
    price = close;
  }
  return candles;
}

// ── Core backtesting loop ──────────────────────────────────────────────────

export function runBacktest(config: BacktestConfig): BacktestResult {
  const {
    strategyId,
    days,
    riskPct,
    tpAtr,
    slAtr,
    initialEquity,
  } = config;

  const seed = strategyId.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * days;
  const BARS_PER_DAY = 4 * 24; // H1 candles
  const candles = generatePriceSeries(days, BARS_PER_DAY, seed);

  const signalFn = STRATEGY_SIGNAL_FNS[strategyId] ?? STRATEGY_SIGNAL_FNS.momentum;
  const WARMUP = 40; // bars needed for indicators
  const SIGNAL_THRESHOLD = 0.45;
  const MIN_CONFIDENCE  = 0.55;

  let equity = initialEquity;
  let peak = equity;
  let maxDD = 0;
  const equityHistory: number[] = [equity];
  const trades: BacktestTrade[] = [];
  const dailyReturns: number[] = [];
  let dayEquity = equity;
  let currentTrade: {
    side: Side;
    entry: number;
    tp: number;
    sl: number;
    barIn: number;
    size: number;
  } | null = null;

  for (let i = WARMUP; i < candles.length; i++) {
    const bar = candles[i];
    const closes = candles.slice(Math.max(0, i - 120), i + 1).map((c) => c.c);
    const kSlice = candles.slice(Math.max(0, i - 120), i + 1).map((c) => ({
      h: c.h, l: c.l, c: c.c,
    }));

    // ── Check existing trade for TP/SL hit ──────────────────────────────
    if (currentTrade) {
      const { side, tp, sl, entry, barIn, size } = currentTrade;
      let exitPrice: number | null = null;
      let hitTP = false, hitSL = false;

      if (side === "LONG") {
        if (bar.h >= tp) { exitPrice = tp; hitTP = true; }
        if (bar.l <= sl) { exitPrice = sl; hitSL = true; }
      } else {
        if (bar.l <= tp) { exitPrice = tp; hitTP = true; }
        if (bar.h >= sl) { exitPrice = sl; hitSL = true; }
      }

      // SL takes priority if both hit on same bar (gap scenario)
      if (hitTP && hitSL) { exitPrice = sl; hitTP = false; }

      // Max holding period: 5 days
      const maxHold = BARS_PER_DAY * 5;
      if (!exitPrice && i - barIn >= maxHold) exitPrice = bar.c;

      if (exitPrice !== null) {
        const dir = side === "LONG" ? 1 : -1;
        const pnlPct = ((exitPrice - entry) / entry) * dir * 100;
        const pnl = (pnlPct / 100) * size;
        equity += pnl;
        if (equity > peak) peak = equity;
        const dd = (peak - equity) / peak;
        if (dd > maxDD) maxDD = dd;
        equityHistory.push(equity);

        trades.push({
          entryAt: candles[barIn].time,
          exitAt:  bar.time,
          side,
          entry,
          exit:    exitPrice,
          pnl,
          pnlPct,
          result:  hitTP ? "WIN" : pnl > -1 ? "BE" : "LOSS",
          barsHeld: i - barIn,
        });
        currentTrade = null;
      }
    }

    // ── Generate new signal when no open trade ───────────────────────────
    if (!currentTrade) {
      const sig = signalFn(closes, kSlice);
      if (Math.abs(sig.bias) >= SIGNAL_THRESHOLD && sig.confidence >= MIN_CONFIDENCE) {
        const atrVal = atr(kSlice, 14) ?? bar.c * 0.001;
        const side: Side = sig.bias > 0 ? "LONG" : "SHORT";
        const entry = bar.c;

        const tp = side === "LONG" ? entry + tpAtr * atrVal : entry - tpAtr * atrVal;
        const sl = side === "LONG" ? entry - slAtr * atrVal : entry + slAtr * atrVal;

        // Risk-based sizing
        const riskAmount  = equity * (riskPct / 100);
        const slDistance  = Math.abs(entry - sl);
        const units       = slDistance > 0 ? riskAmount / slDistance : 0;
        const size        = units * entry;

        if (size > 0 && size < equity * 20) { // sanity guard
          currentTrade = { side, entry, tp, sl, barIn: i, size };
        }
      }
    }

    // ── Daily return tracking ────────────────────────────────────────────
    if (i % BARS_PER_DAY === 0 && i > WARMUP) {
      dailyReturns.push((equity - dayEquity) / dayEquity);
      dayEquity = equity;
    }
  }

  // ── Close any open trade at last bar ──────────────────────────────────
  if (currentTrade) {
    const bar = candles[candles.length - 1];
    const dir = currentTrade.side === "LONG" ? 1 : -1;
    const pnlPct = ((bar.c - currentTrade.entry) / currentTrade.entry) * dir * 100;
    const pnl = (pnlPct / 100) * currentTrade.size;
    equity += pnl;
    equityHistory.push(equity);
    trades.push({
      entryAt: candles[currentTrade.barIn].time,
      exitAt: bar.time,
      side: currentTrade.side,
      entry: currentTrade.entry,
      exit: bar.c,
      pnl,
      pnlPct,
      result: pnl > 0 ? "WIN" : "LOSS",
      barsHeld: candles.length - 1 - currentTrade.barIn,
    });
  }

  // ── Statistics ────────────────────────────────────────────────────────
  const wins    = trades.filter((t) => t.result === "WIN").length;
  const winRate = trades.length > 0 ? wins / trades.length : 0;
  const totalGain = trades.filter((t) => t.pnl > 0).reduce((a, t) => a + t.pnl, 0);
  const totalLoss = Math.abs(trades.filter((t) => t.pnl < 0).reduce((a, t) => a + t.pnl, 0));
  const profitFactor = totalLoss > 0 ? totalGain / totalLoss : totalGain > 0 ? 99 : 0;

  let sharpe = 0;
  if (dailyReturns.length >= 5) {
    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length;
    const std = Math.sqrt(variance);
    sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;
  }

  const totalReturn = equity - initialEquity;
  const totalReturnPct = (totalReturn / initialEquity) * 100;
  const avgBarsHeld = trades.length > 0
    ? trades.reduce((a, t) => a + t.barsHeld, 0) / trades.length
    : 0;
  const annualReturn = totalReturnPct * (365 / days);
  const calmar = maxDD > 0 ? (annualReturn / 100) / maxDD : 0;

  return {
    config,
    trades,
    equityHistory,
    winRate,
    profitFactor,
    sharpe,
    maxDrawdown: maxDD,
    totalReturn,
    totalReturnPct,
    avgBarsHeld,
    calmar,
  };
}
