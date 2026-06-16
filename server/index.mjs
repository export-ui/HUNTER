// Rift Hunter — OANDA v20 secure proxy.
//
// The OANDA API token NEVER reaches the browser. The frontend talks only to
// this server, which injects the bearer token and forwards to OANDA. Trading
// (order placement / closing) is gated behind ALLOW_TRADING so monitoring is
// always safe by default.

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const {
  OANDA_API_TOKEN,
  OANDA_ACCOUNT_ID,
  OANDA_ENVIRONMENT = "practice", // "practice" | "live"
  ALLOW_TRADING = "false",
  CORS_ORIGIN = "*",
  PORT = "8787",
  DEFAULT_TP_PCT = "0.8", // take-profit price distance (%)
  DEFAULT_SL_PCT = "0.4", // stop-loss price distance (%)
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

// ── OANDA helpers ──────────────────────────────────────────────────────────
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
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const message =
      body?.errorMessage || body?.message || `OANDA request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

const toDisplay = (inst) => inst.replace("_", "/");
const toOanda = (sym) => sym.replace("/", "_").toUpperCase();

// ── Bracket helpers ──────────────────────────────────────────────────────────
const precisionCache = new Map();

async function getPrecision(instrument) {
  if (precisionCache.has(instrument)) return precisionCache.get(instrument);
  let precision = 5; // sane FX default
  try {
    const { instruments = [] } = await oanda(
      `/instruments?instruments=${encodeURIComponent(instrument)}`
    );
    if (instruments[0]?.displayPrecision != null)
      precision = instruments[0].displayPrecision;
  } catch {
    /* fall back to default */
  }
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

/** Compute TP/SL prices from a reference price + percentage distances.
 *  `long` true → TP above / SL below; false → mirrored. Returns {} when both
 *  percentages are falsy (protection disabled). */
function bracketPrices(ref, long, tpPct, slPct, dp) {
  const out = {};
  if (tpPct && tpPct > 0) {
    const tp = long ? ref * (1 + tpPct / 100) : ref * (1 - tpPct / 100);
    out.takeProfit = round(tp, dp);
  }
  if (slPct && slPct > 0) {
    const sl = long ? ref * (1 - slPct / 100) : ref * (1 + slPct / 100);
    out.stopLoss = round(sl, dp);
  }
  return out;
}

function requireConfig(_req, res, next) {
  if (!configured) {
    return res
      .status(503)
      .json({ error: "OANDA not configured. Set OANDA_API_TOKEN and OANDA_ACCOUNT_ID." });
  }
  next();
}

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
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
  });
});

app.get(
  "/api/account",
  requireConfig,
  handle(async (_req, res) => {
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
  })
);

app.get(
  "/api/trades",
  requireConfig,
  handle(async (_req, res) => {
    const { trades = [] } = await oanda("/openTrades");
    if (trades.length === 0) return res.json([]);

    // Live marks for every open instrument.
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
    } catch {
      /* pricing is best-effort; fall back to entry price */
    }

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

      // Strategy/confidence round-trip via clientExtensions we set on entry.
      let strategy = "Manual";
      let confidence = 0.7;
      try {
        const meta = JSON.parse(t.clientExtensions?.comment || "{}");
        if (meta.strategy) strategy = meta.strategy;
        if (typeof meta.confidence === "number") confidence = meta.confidence;
      } catch {
        /* no metadata */
      }

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
  })
);

app.get(
  "/api/pricing",
  requireConfig,
  handle(async (req, res) => {
    const instruments = String(req.query.instruments || "")
      .split(",")
      .map((s) => toOanda(s.trim()))
      .filter(Boolean)
      .join(",");
    if (!instruments) return res.json({ prices: [] });
    const data = await oanda(`/pricing?instruments=${encodeURIComponent(instruments)}`);
    res.json(data);
  })
);

app.post(
  "/api/order",
  requireConfig,
  handle(async (req, res) => {
    if (!TRADING_ENABLED) {
      return res
        .status(403)
        .json({ error: "Trading disabled. Set ALLOW_TRADING=true on the server to arm." });
    }
    const {
      instrument,
      units,
      strategy = "Rift Hunter",
      confidence = 0.7,
      takeProfitPct,
      stopLossPct,
    } = req.body || {};
    if (!instrument || !units || Number.isNaN(Number(units))) {
      return res.status(400).json({ error: "instrument and numeric units are required." });
    }

    const oandaInstrument = toOanda(instrument);
    const long = Number(units) > 0;

    // Native OANDA brackets — attached on fill so they live on OANDA's servers
    // and survive the app/proxy being closed. Pass null/0 to disable.
    const tpPct = takeProfitPct === undefined ? Number(DEFAULT_TP_PCT) : Number(takeProfitPct);
    const slPct = stopLossPct === undefined ? Number(DEFAULT_SL_PCT) : Number(stopLossPct);

    const order = {
      type: "MARKET",
      instrument: oandaInstrument,
      units: String(Math.trunc(Number(units))),
      timeInForce: "FOK",
      positionFill: "DEFAULT",
      tradeClientExtensions: {
        tag: "rift-hunter",
        comment: JSON.stringify({ strategy, confidence }),
      },
    };

    if ((tpPct && tpPct > 0) || (slPct && slPct > 0)) {
      const [ref, dp] = await Promise.all([
        getMid(oandaInstrument),
        getPrecision(oandaInstrument),
      ]);
      if (ref) {
        const { takeProfit, stopLoss } = bracketPrices(ref, long, tpPct, slPct, dp);
        if (takeProfit)
          order.takeProfitOnFill = { price: String(takeProfit), timeInForce: "GTC" };
        if (stopLoss)
          order.stopLossOnFill = { price: String(stopLoss), timeInForce: "GTC" };
      }
    }

    const result = await oanda("/orders", {
      method: "POST",
      body: JSON.stringify({ order }),
    });
    res.json(result);
  })
);

app.put(
  "/api/trades/:id/brackets",
  requireConfig,
  handle(async (req, res) => {
    if (!TRADING_ENABLED) {
      return res
        .status(403)
        .json({ error: "Trading disabled. Set ALLOW_TRADING=true on the server to arm." });
    }
    const { takeProfitPct, stopLossPct, takeProfit, stopLoss } = req.body || {};

    // Resolve the trade so we can price brackets off its entry.
    const { trade } = await oanda(`/trades/${req.params.id}`);
    if (!trade) return res.status(404).json({ error: "Trade not found." });
    const long = Number(trade.currentUnits) >= 0;
    const entry = Number(trade.price);
    const dp = await getPrecision(trade.instrument);

    let tp = takeProfit;
    let sl = stopLoss;
    if (tp == null && takeProfitPct != null) {
      tp = bracketPrices(entry, long, Number(takeProfitPct), 0, dp).takeProfit;
    }
    if (sl == null && stopLossPct != null) {
      sl = bracketPrices(entry, long, 0, Number(stopLossPct), dp).stopLoss;
    }
    // Defaults when the caller asked for protection without specifics.
    if (tp == null && sl == null) {
      const def = bracketPrices(entry, long, Number(DEFAULT_TP_PCT), Number(DEFAULT_SL_PCT), dp);
      tp = def.takeProfit;
      sl = def.stopLoss;
    }

    const body = {};
    if (tp != null) body.takeProfit = { price: String(round(Number(tp), dp)), timeInForce: "GTC" };
    if (sl != null) body.stopLoss = { price: String(round(Number(sl), dp)), timeInForce: "GTC" };

    const result = await oanda(`/trades/${req.params.id}/orders`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    res.json(result);
  })
);

app.put(
  "/api/trades/:id/close",
  requireConfig,
  handle(async (req, res) => {
    if (!TRADING_ENABLED) {
      return res
        .status(403)
        .json({ error: "Trading disabled. Set ALLOW_TRADING=true on the server to arm." });
    }
    const result = await oanda(`/trades/${req.params.id}/close`, {
      method: "PUT",
      body: JSON.stringify({ units: "ALL" }),
    });
    res.json(result);
  })
);

app.listen(Number(PORT), () => {
  console.log(`\n🛰  Rift Hunter OANDA proxy on :${PORT}`);
  console.log(`   environment : ${OANDA_ENVIRONMENT}${IS_LIVE ? "  ⚠ LIVE MONEY" : ""}`);
  console.log(`   configured  : ${configured ? "yes" : "NO (set token + account id)"}`);
  console.log(`   trading     : ${TRADING_ENABLED ? "ARMED" : "monitoring only"}\n`);
});
