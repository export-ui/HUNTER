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
    const { instrument, units, strategy = "Rift Hunter", confidence = 0.7 } = req.body || {};
    if (!instrument || !units || Number.isNaN(Number(units))) {
      return res.status(400).json({ error: "instrument and numeric units are required." });
    }
    const order = {
      order: {
        type: "MARKET",
        instrument: toOanda(instrument),
        units: String(Math.trunc(Number(units))),
        timeInForce: "FOK",
        positionFill: "DEFAULT",
        tradeClientExtensions: {
          tag: "rift-hunter",
          comment: JSON.stringify({ strategy, confidence }),
        },
      },
    };
    const result = await oanda("/orders", { method: "POST", body: JSON.stringify(order) });
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
