// Rift Hunter — OANDA v20 secure proxy + technical intelligence engine.
//
// The OANDA API token NEVER reaches the browser. The frontend talks only to
// this server, which injects the bearer token and forwards to OANDA. Trading
// (order placement / closing) is gated behind ALLOW_TRADING.
//
// Signal computation: real EMA/RSI/ATR/Bollinger/MACD computed from live
// OANDA candle data. Every strategy produces a bias (-1..1) and confidence
// (0..1) that the client uses for autonomous decisions.

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const {
  OANDA_API_TOKEN,
  OANDA_ACCOUNT_ID,
  OANDA_ENVIRONMENT = "practice",
  ALLOW_TRADING = "false",
  CORS_ORIGIN = "*",
  PORT = "8787",
  // 3:1 reward-to-risk ratio — professional standard.
  DEFAULT_TP_PCT = "1.2",
  DEFAULT_SL_PCT = "0.4",
  // Max daily drawdown before autonomous trading is suspended.
  MAX_DD_PCT = "5",
} = process.env;

const TRADING_ENABLED = String(ALLOW_TRADING).toLowerCase() === "true";
const IS_LIVE = OANDA_ENVIRONMENT === "live";
const OANDA_BASE = IS_LIVE
  ? "https://api-fxtrade.oanda.com"
  : "https://api-fxpractice.oanda.com";

const configured = Boolean(OANDA_API_TOKEN && OANDA_ACCOUNT_ID);

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// ── OANDA account-scoped helper ────────────────────────────────────────────
async function oanda(path, init = {}) {
  const res = await fetch(`${OANDA_BASE}/v3/accounts/${OANDA_ACCOUNT_ID}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${OANDA_API_TOKEN}`,
      "Content-Type": "application/json",
      "Accept-Datetime-Format": "RFC3339",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const message = body?.errorMessage || body?.message || `OANDA ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

// ── OANDA instrument-scoped helper (candles, pricing — no accountID) ───────
async function oandaInst(path, init = {}) {
  const res = await fetch(`${OANDA_BASE}/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${OANDA_API_TOKEN}`,
      "Content-Type": "application/json",
      "Accept-Datetime-Format": "RFC3339",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const message = body?.errorMessage || body?.message || `OANDA ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

const toDisplay = (inst) => inst.replace("_", "/");
const toOanda   = (sym)  => sym.replace("/", "_").toUpperCase();

// ── Precision cache ────────────────────────────────────────────────────────
const precisionCache = new Map();
async function getPrecision(instrument) {
  if (precisionCache.has(instrument)) return precisionCache.get(instrument);
  let precision = 5;
  try {
    const { instruments = [] } = await oanda(
      `/instruments?instruments=${encodeURIComponent(instrument)}`
    );
    if (instruments[0]?.displayPrecision != null)
      precision = instruments[0].displayPrecision;
  } catch { /* fall back */ }
  precisionCache.set(instrument, precision);
  return precision;
}

async function getMid(instrument) {
  const { prices = [] } = await oanda(
    `/pricing?instruments=${encodeURIComponent(instrument)}`
  );
  const p = prices[0];
  if (!p) return null;
  const bid = Number(p.bids?.[0]?.price ?? p.closeoutBid);
  const ask = Number(p.asks?.[0]?.price ?? p.closeoutAsk);
  return (bid + ask) / 2;
}

const round = (v, dp) => Number(v.toFixed(dp));

function bracketPrices(ref, long, tpPct, slPct, dp) {
  const out = {};
  if (tpPct && tpPct > 0) {
    out.takeProfit = round(long ? ref * (1 + tpPct / 100) : ref * (1 - tpPct / 100), dp);
  }
  if (slPct && slPct > 0) {
    out.stopLoss = round(long ? ref * (1 - slPct / 100) : ref * (1 + slPct / 100), dp);
  }
  return out;
}

/** Bracket prices using ATR multiples (volatility-adapted stops). */
function bracketPricesATR(ref, long, atrVal, tpMult, slMult, dp) {
  const out = {};
  if (tpMult > 0 && atrVal > 0) {
    out.takeProfit = round(long ? ref + tpMult * atrVal : ref - tpMult * atrVal, dp);
  }
  if (slMult > 0 && atrVal > 0) {
    out.stopLoss = round(long ? ref - slMult * atrVal : ref + slMult * atrVal, dp);
  }
  return out;
}

// ── Technical indicator library ────────────────────────────────────────────

/** EMA using Wilder/exponential smoothing. Returns scalar for last value. */
function ema(closes, period) {
  if (!closes || closes.length < period) return null;
  const k = 2 / (period + 1);
  let val = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) val = closes[i] * k + val * (1 - k);
  return val;
}

/** RSI using Wilder smoothing. Returns 0..100. */
function rsi(closes, period = 14) {
  if (!closes || closes.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** ATR using Wilder smoothing. Expects array of { h, l, c } (numbers). */
function atr(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const { h, l, c: pc } = { h: candles[i].h, l: candles[i].l, c: candles[i - 1].c };
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let val = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) val = (val * (period - 1) + trs[i]) / period;
  return val;
}

/** Bollinger Bands. Returns { upper, mid, lower, pctB, bandwidth } or null. */
function bollingerBands(closes, period = 20, mult = 2) {
  if (!closes || closes.length < period) return null;
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

/** MACD(12,26,9). Returns { macd, signal, hist } or null. */
function macdIndicator(closes, fast = 12, slow = 26, sig = 9) {
  if (!closes || closes.length < slow + sig) return null;
  const kf = 2 / (fast + 1), ks = 2 / (slow + 1), ksg = 2 / (sig + 1);

  // Build fast EMA from index 0
  let ef = closes.slice(0, fast).reduce((a, b) => a + b, 0) / fast;
  for (let i = fast; i < slow; i++) ef = closes[i] * kf + ef * (1 - kf);

  // Build slow EMA and MACD line
  let es = closes.slice(0, slow).reduce((a, b) => a + b, 0) / slow;
  const macdLine = [];
  for (let i = slow; i < closes.length; i++) {
    ef = closes[i] * kf + ef * (1 - kf);
    es = closes[i] * ks + es * (1 - ks);
    macdLine.push(ef - es);
  }
  if (macdLine.length < sig) return null;

  let sv = macdLine.slice(0, sig).reduce((a, b) => a + b, 0) / sig;
  for (let i = sig; i < macdLine.length; i++) sv = macdLine[i] * ksg + sv * (1 - ksg);

  const lastMacd = macdLine[macdLine.length - 1];
  return { macd: lastMacd, signal: sv, hist: lastMacd - sv };
}

// ── Signal generators for each strategy ───────────────────────────────────

/** Quantum Momentum — EMA crossover + MACD confirmation. */
function momentumSignal(closes) {
  const e8 = ema(closes, 8);
  const e21 = ema(closes, 21);
  const m = macdIndicator(closes);
  if (e8 === null || e21 === null || !m) return { bias: 0, confidence: 0.3 };

  const emaDiff = (e8 - e21) / e21;
  const emaNorm = Math.tanh(emaDiff * 300);
  const macdDir = m.hist > 0 ? 1 : -1;
  const agree = Math.sign(emaNorm) === macdDir;
  const bias = (emaNorm * 0.6 + macdDir * 0.4);
  const confidence = agree
    ? Math.min(0.92, 0.60 + Math.abs(emaNorm) * 0.35)
    : Math.max(0.25, 0.50 - Math.abs(emaNorm) * 0.2);

  return { bias: Math.max(-1, Math.min(1, bias)), confidence };
}

/** Mean Reversion — Bollinger Bands + RSI extreme fade. */
function meanReversionSignal(closes) {
  const bb = bollingerBands(closes);
  const r = rsi(closes);
  if (!bb) return { bias: 0, confidence: 0.3 };

  // Strong fade signal: price beyond bands + RSI extreme
  const oversold  = bb.pctB < 0.15 && r < 30;
  const overbought = bb.pctB > 0.85 && r > 70;
  const mildOS    = bb.pctB < 0.30 && r < 40;
  const mildOB    = bb.pctB > 0.70 && r > 60;

  let bias = (0.5 - bb.pctB) * 2;
  let confidence = 0.35;
  if (oversold)   { bias =  1.0; confidence = Math.min(0.90, 0.72 + bb.bandwidth * 8); }
  else if (overbought) { bias = -1.0; confidence = Math.min(0.90, 0.72 + bb.bandwidth * 8); }
  else if (mildOS) { bias =  0.5; confidence = 0.55; }
  else if (mildOB) { bias = -0.5; confidence = 0.55; }

  return { bias: Math.max(-1, Math.min(1, bias)), confidence };
}

/** Liquidity Breakout — N-period high/low breakout with ATR confirmation. */
function breakoutSignal(closes, atrValue) {
  const N = 20;
  if (closes.length < N + 2 || !atrValue) return { bias: 0, confidence: 0.3 };

  const lookback = closes.slice(-N - 1, -1);
  const highest = Math.max(...lookback);
  const lowest  = Math.min(...lookback);
  const current = closes[closes.length - 1];
  const prev    = closes[closes.length - 2];

  const didBreakHigh = current > highest && prev <= highest;
  const didBreakLow  = current < lowest  && prev >= lowest;

  if (didBreakHigh) {
    const strength = Math.min(2, (current - highest) / atrValue);
    return { bias: Math.min(1, 0.65 + strength * 0.2), confidence: Math.min(0.88, 0.60 + strength * 0.15) };
  }
  if (didBreakLow) {
    const strength = Math.min(2, (lowest - current) / atrValue);
    return { bias: Math.max(-1, -(0.65 + strength * 0.2)), confidence: Math.min(0.88, 0.60 + strength * 0.15) };
  }
  // Inside range — no conviction
  return { bias: 0, confidence: 0.28 };
}

/** Cross-Venue Arb — proxied as short-vs-medium momentum dislocation. */
function arbSignal(closes) {
  const e5  = ema(closes, 5);
  const e10 = ema(closes, 10);
  const e20 = ema(closes, 20);
  if (!e5 || !e10 || !e20) return { bias: 0, confidence: 0.3 };

  const shortMom = (e5 - e10) / e10;
  const medMom   = (e10 - e20) / e20;
  const displace  = shortMom - medMom;
  // Fade the dislocation back to medium trend
  const bias = Math.tanh(-displace * 800);
  const confidence = Math.min(0.78, 0.42 + Math.abs(displace) * 400 * 0.15);
  return { bias, confidence };
}

/** Neural Sentiment — proxied by candle pattern recognition. */
function sentimentSignal(candles) {
  if (!candles || candles.length < 6) return { bias: 0, confidence: 0.35 };

  const recent = candles.slice(-6);
  let score = 0;

  for (let i = 1; i < recent.length; i++) {
    const { o, h, l, c } = recent[i];
    const { o: po, c: pc } = recent[i - 1];
    const body     = c - o;
    const prevBody = pc - po;
    const range    = h - l;

    // Engulfing: body fully engulfs previous candle's body, opposite direction
    if (Math.abs(body) > Math.abs(prevBody) * 1.1 && Math.sign(body) !== Math.sign(prevBody)) {
      score += Math.sign(body) * 0.4;
    }
    if (range > 0) {
      const lowerShadow = Math.min(o, c) - l;
      const upperShadow = h - Math.max(o, c);
      // Hammer (bullish reversal): long lower shadow, tiny body
      if (lowerShadow / range > 0.6 && Math.abs(body) / range < 0.25) score += 0.35;
      // Shooting star (bearish reversal)
      if (upperShadow / range > 0.6 && Math.abs(body) / range < 0.25) score -= 0.35;
    }
  }

  // Weight recent candles more
  const r = rsi(recent.map(c => c.c));
  const rsiBias = (r - 50) / 50;
  score = score * 0.6 + rsiBias * 0.4;

  const bias = Math.max(-1, Math.min(1, score));
  return { bias, confidence: Math.min(0.82, 0.42 + Math.abs(bias) * 0.4) };
}

/** Volatility Harvest — sell elevated vol, buy compressed vol. */
function volHarvestSignal(closes, atrValue, historicalAtr) {
  if (!atrValue || !historicalAtr || historicalAtr === 0) return { bias: 0, confidence: 0.3 };

  const r = rsi(closes);
  const volRatio = atrValue / historicalAtr;
  const trendBias = r > 50 ? 1 : -1;

  if (volRatio > 1.6) {
    // Elevated vol → expect mean reversion in vol; trade with trend (momentum)
    const strength = Math.min(1, (volRatio - 1) * 0.55);
    return { bias: trendBias * strength, confidence: Math.min(0.80, 0.55 + strength * 0.25) };
  }
  if (volRatio < 0.65) {
    // Compressed vol → expect expansion; neutral-to-bullish bias (mean bias of FX)
    return { bias: 0.2, confidence: 0.50 };
  }

  // Normal vol: no strong signal
  return { bias: 0, confidence: 0.30 };
}

// ── Market regime detection ────────────────────────────────────────────────
function detectRegime(closes, atrValue) {
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  if (!e20 || !e50 || !atrValue) return "TRENDING";

  const trendStrength = Math.abs(e20 - e50) / e50;
  const price = closes[closes.length - 1];
  const volPct = atrValue / price;

  if (trendStrength > 0.004) return e20 > e50 ? "RISK-ON" : "RISK-OFF";
  if (volPct > 0.012)        return "CHOPPY";
  return "TRENDING";
}

// ── Fetch candles from OANDA ───────────────────────────────────────────────
const candleCache = new Map();
const CACHE_TTL = 60_000; // 1 min

async function fetchCandles(instrument, granularity = "M15", count = 120) {
  const key = `${instrument}:${granularity}:${count}`;
  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const data = await oandaInst(
    `/instruments/${encodeURIComponent(instrument)}/candles?price=M&granularity=${granularity}&count=${count}`
  );
  const candles = (data.candles || [])
    .filter((c) => c.complete)
    .map((c) => ({
      time: c.time,
      o: Number(c.mid.o),
      h: Number(c.mid.h),
      l: Number(c.mid.l),
      c: Number(c.mid.c),
      v: c.volume || 0,
    }));

  candleCache.set(key, { ts: Date.now(), data: candles });
  return candles;
}

// ── Compute all strategy signals for one instrument ────────────────────────
async function computeSignals(oandaInstrument) {
  const [m15, h1] = await Promise.all([
    fetchCandles(oandaInstrument, "M15", 120),
    fetchCandles(oandaInstrument, "H1", 100),
  ]);

  if (m15.length < 40) {
    return {
      momentum:   { bias: 0, confidence: 0.3 },
      meanrev:    { bias: 0, confidence: 0.3 },
      breakout:   { bias: 0, confidence: 0.3 },
      arb:        { bias: 0, confidence: 0.3 },
      sentiment:  { bias: 0, confidence: 0.3 },
      vol:        { bias: 0, confidence: 0.3 },
      aggregate:  0,
      regime:     "TRENDING",
      atr:        null,
      atrPct:     null,
    };
  }

  const closes = m15.map((c) => c.c);
  const atrVal = atr(m15, 14);
  const h1Closes = h1.map((c) => c.c);
  const historicalAtr = atr(h1.slice(0, 60), 14);

  const momentum  = momentumSignal(closes);
  const meanrev   = meanReversionSignal(closes);
  const breakout  = breakoutSignal(closes, atrVal);
  const arbSig    = arbSignal(closes);
  const sentiment = sentimentSignal(m15);
  const volSig    = volHarvestSignal(closes, atrVal, historicalAtr);

  // Weighted ensemble with conviction-scaled weights
  const strategies = [
    { s: momentum,  w: 0.22 },
    { s: meanrev,   w: 0.16 },
    { s: breakout,  w: 0.18 },
    { s: arbSig,    w: 0.12 },
    { s: sentiment, w: 0.17 },
    { s: volSig,    w: 0.15 },
  ];

  // Weight each strategy by its confidence × base weight
  const wsum = strategies.reduce((a, { s, w }) => a + w * s.confidence, 0);
  const aggregate = wsum > 0
    ? strategies.reduce((a, { s, w }) => a + w * s.confidence * s.bias, 0) / wsum
    : 0;

  const price = closes[closes.length - 1];

  return {
    momentum,
    meanrev,
    breakout,
    arb: arbSig,
    sentiment,
    vol: volSig,
    aggregate: Math.max(-1, Math.min(1, aggregate)),
    regime: detectRegime(h1Closes.length > 50 ? h1Closes : closes, atrVal),
    atr: atrVal,
    atrPct: atrVal && price ? (atrVal / price) * 100 : null,
  };
}

// ── Compute real performance stats from closed trades ─────────────────────
async function computePerformance() {
  const { trades = [] } = await oanda("/trades?state=CLOSED&count=200");
  if (trades.length === 0) {
    return {
      totalTrades: 0, winRate: null, profitFactor: null,
      avgRR: null, sharpe: null, maxDrawdown: null,
      strategyPerf: {},
    };
  }

  let wins = 0, totalGain = 0, totalLoss = 0;
  const dailyPnl = {};
  const strategyPerf = {};
  let peak = 0, equity = 0, maxDD = 0;

  for (const t of trades) {
    const pnl = Number(t.realizedPL || 0);
    if (pnl > 0) { wins++; totalGain += pnl; }
    else if (pnl < 0) { totalLoss += Math.abs(pnl); }

    equity += pnl;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDD) maxDD = dd;

    const day = (t.closeTime || t.openTime || "").slice(0, 10);
    dailyPnl[day] = (dailyPnl[day] || 0) + pnl;

    // Strategy attribution via clientExtensions
    let strat = "Manual";
    try {
      const meta = JSON.parse(t.clientExtensions?.comment || "{}");
      if (meta.strategy) strat = meta.strategy;
    } catch { /* no meta */ }
    if (!strategyPerf[strat]) strategyPerf[strat] = { wins: 0, losses: 0, pnl: 0 };
    strategyPerf[strat].pnl += pnl;
    if (pnl > 0) strategyPerf[strat].wins++;
    else if (pnl < 0) strategyPerf[strat].losses++;
  }

  const winRate = trades.length > 0 ? wins / trades.length : null;
  const profitFactor = totalLoss > 0 ? totalGain / totalLoss : totalGain > 0 ? 999 : null;

  // Sharpe: daily returns → (mean/std) × √252
  const days = Object.values(dailyPnl);
  let sharpe = null;
  if (days.length >= 5) {
    const mean = days.reduce((a, b) => a + b, 0) / days.length;
    const variance = days.reduce((a, b) => a + (b - mean) ** 2, 0) / days.length;
    const std = Math.sqrt(variance);
    sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : null;
  }

  return {
    totalTrades: trades.length,
    winRate,
    profitFactor,
    sharpe,
    maxDrawdown: maxDD,
    strategyPerf,
  };
}

// ── Middleware ─────────────────────────────────────────────────────────────
function requireConfig(_req, res, next) {
  if (!configured) {
    return res.status(503).json({
      error: "OANDA not configured. Set OANDA_API_TOKEN and OANDA_ACCOUNT_ID.",
    });
  }
  next();
}

function handle(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (err) {
      console.error("[oanda]", err.status || "", err.message);
      res.status(err.status || 500).json({ error: err.message, details: err.body });
    }
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    configured,
    environment: OANDA_ENVIRONMENT,
    live: IS_LIVE,
    tradingEnabled: TRADING_ENABLED,
    maxDdPct: Number(MAX_DD_PCT),
  });
});

app.get("/api/account", requireConfig, handle(async (_req, res) => {
  const { account } = await oanda("/summary");
  res.json({
    currency: account.currency,
    equity: Number(account.NAV),
    balance: Number(account.balance),
    unrealizedPL: Number(account.unrealizedPL),
    realizedPL: Number(account.pl),
    marginUsed: Number(account.marginUsed || 0),
    marginAvailable: Number(account.marginAvailable || 0),
    openTradeCount: account.openTradeCount,
    openPositionCount: account.openPositionCount,
    environment: OANDA_ENVIRONMENT,
  });
}));

app.get("/api/trades", requireConfig, handle(async (_req, res) => {
  const { trades = [] } = await oanda("/openTrades");
  if (trades.length === 0) return res.json([]);

  const instruments = [...new Set(trades.map((t) => t.instrument))].join(",");
  let priceMap = {};
  try {
    const { prices = [] } = await oanda(
      `/pricing?instruments=${encodeURIComponent(instruments)}`
    );
    priceMap = Object.fromEntries(
      prices.map((p) => {
        const bid = Number(p.bids?.[0]?.price ?? p.closeoutBid);
        const ask = Number(p.asks?.[0]?.price ?? p.closeoutAsk);
        return [p.instrument, (bid + ask) / 2];
      })
    );
  } catch { /* best-effort */ }

  const mapped = trades.map((t) => {
    const units = Number(t.currentUnits);
    const entry = Number(t.price);
    const mark = priceMap[t.instrument] ?? entry;
    const dir = units >= 0 ? 1 : -1;
    const notional = Math.abs(units) * mark;
    const marginUsed = Number(t.marginUsed || 0);
    const leverage = marginUsed > 0 ? Math.max(1, Math.round(notional / marginUsed)) : 1;
    const pnl = Number(t.unrealizedPL);
    const pnlPct = entry > 0 ? ((mark - entry) / entry) * dir * 100 * leverage : 0;

    let strategy = "Manual", confidence = 0.7;
    try {
      const meta = JSON.parse(t.clientExtensions?.comment || "{}");
      if (meta.strategy) strategy = meta.strategy;
      if (typeof meta.confidence === "number") confidence = meta.confidence;
    } catch { /* no meta */ }

    return {
      id: t.id,
      symbol: toDisplay(t.instrument),
      side: dir > 0 ? "LONG" : "SHORT",
      strategy,
      entry,
      mark,
      size: notional,
      leverage,
      pnl,
      pnlPct,
      confidence,
      openedAt: new Date(t.openTime).getTime(),
      status: "OPEN",
      tpPrice: t.takeProfitOrder ? Number(t.takeProfitOrder.price) : null,
      slPrice: t.stopLossOrder ? Number(t.stopLossOrder.price) : null,
    };
  });

  res.json(mapped);
}));

app.get("/api/pricing", requireConfig, handle(async (req, res) => {
  const instruments = String(req.query.instruments || "")
    .split(",")
    .map((s) => toOanda(s.trim()))
    .filter(Boolean)
    .join(",");
  if (!instruments) return res.json({ prices: [] });
  const data = await oanda(`/pricing?instruments=${encodeURIComponent(instruments)}`);
  res.json(data);
}));

/** Real technical signal endpoint — powers the autonomous decision engine. */
app.get("/api/signals", requireConfig, handle(async (req, res) => {
  const rawList = String(req.query.instruments || "EUR_USD,GBP_USD,USD_JPY,AUD_USD,USD_CAD,XAU_USD");
  const instruments = rawList.split(",").map((s) => s.trim()).filter(Boolean);

  const results = await Promise.allSettled(instruments.map((inst) => computeSignals(inst)));

  const signals = {};
  instruments.forEach((inst, i) => {
    const r = results[i];
    const display = toDisplay(inst);
    if (r.status === "fulfilled") {
      signals[display] = r.value;
    } else {
      console.warn(`[signals] ${inst}: ${r.reason?.message}`);
      signals[display] = {
        momentum: { bias: 0, confidence: 0.3 },
        meanrev:  { bias: 0, confidence: 0.3 },
        breakout: { bias: 0, confidence: 0.3 },
        arb:      { bias: 0, confidence: 0.3 },
        sentiment:{ bias: 0, confidence: 0.3 },
        vol:      { bias: 0, confidence: 0.3 },
        aggregate: 0, regime: "TRENDING", atr: null, atrPct: null,
      };
    }
  });

  res.json({ signals, computedAt: Date.now() });
}));

/** Real performance stats from closed OANDA trades. */
app.get("/api/performance", requireConfig, handle(async (_req, res) => {
  const perf = await computePerformance();
  res.json(perf);
}));

/** Raw candles for backtesting. */
app.get("/api/candles", requireConfig, handle(async (req, res) => {
  const { instrument = "EUR_USD", granularity = "H1", count = 500 } = req.query;
  const oandaInst2 = toOanda(String(instrument));
  const candles = await fetchCandles(oandaInst2, String(granularity), Math.min(5000, Number(count)));
  res.json({ instrument: toDisplay(oandaInst2), granularity, candles });
}));

app.post("/api/order", requireConfig, handle(async (req, res) => {
  if (!TRADING_ENABLED) {
    return res.status(403).json({ error: "Trading disabled. Set ALLOW_TRADING=true on the server to arm." });
  }

  const {
    instrument,
    units,
    side,
    riskPct,
    strategy = "Rift Hunter",
    confidence = 0.7,
    takeProfitPct,
    stopLossPct,
    // ATR-based brackets (preferred when atrValue is supplied)
    atrValue,
    tpAtrMult,
    slAtrMult,
  } = req.body || {};

  if (!instrument) return res.status(400).json({ error: "instrument is required." });

  const oandaInstrument = toOanda(instrument);
  const slPctEarly = stopLossPct === undefined ? Number(DEFAULT_SL_PCT) : Number(stopLossPct);

  // ── Daily drawdown guard ────────────────────────────────────────────────
  try {
    const { account } = await oanda("/summary");
    const nav = Number(account.NAV);
    const balance = Number(account.balance);
    const ddPct = balance > 0 ? ((balance - nav) / balance) * 100 : 0;
    if (ddPct > Number(MAX_DD_PCT)) {
      return res.status(403).json({
        error: `Drawdown guard: current drawdown ${ddPct.toFixed(1)}% exceeds limit ${MAX_DD_PCT}%. Trading suspended.`,
      });
    }
  } catch { /* non-fatal: continue if we can't read account */ }

  // ── Position sizing ─────────────────────────────────────────────────────
  let resolvedUnits = Number(units);
  if (!units || Number.isNaN(resolvedUnits)) {
    if (!riskPct || !side) {
      return res.status(400).json({ error: "Provide numeric units, or riskPct + side for risk-based sizing." });
    }
    if (!slPctEarly || slPctEarly <= 0) {
      return res.status(400).json({ error: "Risk-based sizing needs a stop-loss (stopLossPct > 0)." });
    }
    const [{ account }, ref] = await Promise.all([oanda("/summary"), getMid(oandaInstrument)]);
    const equity = Number(account.NAV);
    if (!ref) return res.status(502).json({ error: "No price for instrument." });

    // Risk amount / (price × sl%) = units
    const riskAmount = equity * (Number(riskPct) / 100);
    // If ATR available, use ATR stop; otherwise fall back to pct stop.
    let perUnitRisk;
    if (atrValue && slAtrMult) {
      perUnitRisk = Number(atrValue) * Number(slAtrMult);
    } else {
      perUnitRisk = ref * (slPctEarly / 100);
    }
    const magnitude = Math.max(1, Math.floor(riskAmount / Math.max(0.00001, perUnitRisk)));
    resolvedUnits = side === "SHORT" ? -magnitude : magnitude;
  }

  const long = resolvedUnits > 0;
  const tpPct = takeProfitPct === undefined ? Number(DEFAULT_TP_PCT) : Number(takeProfitPct);
  const slPct = stopLossPct   === undefined ? Number(DEFAULT_SL_PCT) : Number(stopLossPct);

  const order = {
    type: "MARKET",
    instrument: oandaInstrument,
    units: String(Math.trunc(resolvedUnits)),
    timeInForce: "FOK",
    positionFill: "DEFAULT",
    tradeClientExtensions: {
      tag: "rift-hunter",
      comment: JSON.stringify({ strategy, confidence }),
    },
  };

  // ATR-based brackets are preferred; fall back to percentage brackets.
  if (atrValue && tpAtrMult && slAtrMult) {
    const [ref, dp] = await Promise.all([getMid(oandaInstrument), getPrecision(oandaInstrument)]);
    if (ref) {
      const { takeProfit, stopLoss } = bracketPricesATR(
        ref, long, Number(atrValue), Number(tpAtrMult), Number(slAtrMult), dp
      );
      if (takeProfit) order.takeProfitOnFill = { price: String(takeProfit), timeInForce: "GTC" };
      if (stopLoss)   order.stopLossOnFill   = { price: String(stopLoss),   timeInForce: "GTC" };
    }
  } else if (tpPct > 0 || slPct > 0) {
    const [ref, dp] = await Promise.all([getMid(oandaInstrument), getPrecision(oandaInstrument)]);
    if (ref) {
      const { takeProfit, stopLoss } = bracketPrices(ref, long, tpPct, slPct, dp);
      if (takeProfit) order.takeProfitOnFill = { price: String(takeProfit), timeInForce: "GTC" };
      if (stopLoss)   order.stopLossOnFill   = { price: String(stopLoss),   timeInForce: "GTC" };
    }
  }

  const result = await oanda("/orders", { method: "POST", body: JSON.stringify({ order }) });
  res.json(result);
}));

app.post("/api/flatten", requireConfig, handle(async (_req, res) => {
  if (!TRADING_ENABLED) {
    return res.status(403).json({ error: "Trading disabled. Set ALLOW_TRADING=true on the server to arm." });
  }
  const { trades = [] } = await oanda("/openTrades");
  const results = await Promise.allSettled(
    trades.map((t) => oanda(`/trades/${t.id}/close`, { method: "PUT", body: JSON.stringify({ units: "ALL" }) }))
  );
  const closed = results.filter((r) => r.status === "fulfilled").length;
  res.json({ requested: trades.length, closed, failed: results.length - closed });
}));

app.put("/api/trades/:id/brackets", requireConfig, handle(async (req, res) => {
  if (!TRADING_ENABLED) {
    return res.status(403).json({ error: "Trading disabled. Set ALLOW_TRADING=true on the server to arm." });
  }
  const { takeProfitPct, stopLossPct, takeProfit, stopLoss, atrValue, tpAtrMult, slAtrMult } = req.body || {};

  const { trade } = await oanda(`/trades/${req.params.id}`);
  if (!trade) return res.status(404).json({ error: "Trade not found." });

  const long  = Number(trade.currentUnits) >= 0;
  const entry = Number(trade.price);
  const dp    = await getPrecision(trade.instrument);

  let tp = takeProfit, sl = stopLoss;

  if (atrValue && tpAtrMult && slAtrMult) {
    const brackets = bracketPricesATR(entry, long, Number(atrValue), Number(tpAtrMult), Number(slAtrMult), dp);
    if (tp == null) tp = brackets.takeProfit;
    if (sl == null) sl = brackets.stopLoss;
  }
  if (tp == null && takeProfitPct != null) {
    tp = bracketPrices(entry, long, Number(takeProfitPct), 0, dp).takeProfit;
  }
  if (sl == null && stopLossPct != null) {
    sl = bracketPrices(entry, long, 0, Number(stopLossPct), dp).stopLoss;
  }
  if (tp == null && sl == null) {
    const def = bracketPrices(entry, long, Number(DEFAULT_TP_PCT), Number(DEFAULT_SL_PCT), dp);
    tp = def.takeProfit; sl = def.stopLoss;
  }

  const body = {};
  if (tp != null) body.takeProfit = { price: String(round(Number(tp), dp)), timeInForce: "GTC" };
  if (sl != null) body.stopLoss   = { price: String(round(Number(sl), dp)), timeInForce: "GTC" };

  const result = await oanda(`/trades/${req.params.id}/orders`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  res.json(result);
}));

app.put("/api/trades/:id/close", requireConfig, handle(async (req, res) => {
  if (!TRADING_ENABLED) {
    return res.status(403).json({ error: "Trading disabled. Set ALLOW_TRADING=true on the server to arm." });
  }
  const result = await oanda(`/trades/${req.params.id}/close`, {
    method: "PUT",
    body: JSON.stringify({ units: "ALL" }),
  });
  res.json(result);
}));

app.listen(Number(PORT), () => {
  console.log(`\n🛰  Rift Hunter OANDA proxy + signal engine on :${PORT}`);
  console.log(`   environment : ${OANDA_ENVIRONMENT}${IS_LIVE ? "  ⚠ LIVE MONEY" : ""}`);
  console.log(`   configured  : ${configured ? "yes" : "NO (set token + account id)"}`);
  console.log(`   trading     : ${TRADING_ENABLED ? "ARMED" : "monitoring only"}`);
  console.log(`   TP/SL ratio : ${DEFAULT_TP_PCT}% / ${DEFAULT_SL_PCT}% = ${(Number(DEFAULT_TP_PCT) / Number(DEFAULT_SL_PCT)).toFixed(1)}:1 R:R`);
  console.log(`   max DD      : ${MAX_DD_PCT}%\n`);
});
