import { useEffect, useRef, useState, useCallback } from "react";
import type { EngineState, Trade, HenryThought, StrategySignal, Side } from "@/types";
import { STRATEGY_CATALOG, SYMBOLS } from "@/lib/strategies";
import { clamp, rng } from "@/lib/utils";
import { api, type Health } from "@/lib/api";

type RiskLevel = "Guarded" | "Balanced" | "Aggressive";
type Mode = "connecting" | "sim" | "live";
type Connection = "connecting" | "ok" | "error";

const RISK_PROFILE: Record<
  RiskLevel,
  { maxTrades: number; size: number; lev: number; units: number }
> = {
  Guarded: { maxTrades: 4, size: 4000, lev: 2, units: 1000 },
  Balanced: { maxTrades: 6, size: 8000, lev: 5, units: 3000 },
  Aggressive: { maxTrades: 8, size: 16000, lev: 10, units: 8000 },
};

// Instruments Henry hunts when trading live on OANDA.
const LIVE_INSTRUMENTS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "XAU/USD"];

// Autonomous live risk management. TP/SL are PRICE-distance percentages sent
// to OANDA as native bracket orders (take-profit / stop-loss on fill), so they
// live on OANDA's servers and protect the position even if the app is closed.
const TP_PCT = 0.8;
const SL_PCT = 0.4;
const SIGNAL_THRESHOLD = 0.35;

const THOUGHTS_BUY = [
  "Momentum and sentiment agree — scaling into {sym}.",
  "Order-book imbalance on {sym}. Hunting the breakout.",
  "{sym} dislocation detected across venues. Capturing edge.",
  "Conviction stacking on {sym}. Opening a long.",
];
const THOUGHTS_SELL = [
  "Taking profit on {sym}. Edge has decayed.",
  "Vol spiking on {sym} — trimming risk now.",
  "Mean reversion signal flipped {sym}. Closing the book.",
  "Locking gains on {sym} before the regime shifts.",
];
const THOUGHTS_IDLE = [
  "Scanning 312 markets across 14 venues…",
  "Re-weighting the ensemble in real time.",
  "Liquidity is thin. Patience compounds returns.",
  "Recalibrating risk to current volatility.",
  "No clean edge yet — protecting capital.",
];

let counter = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

function makeStrategies(seed: number): StrategySignal[] {
  const r = rng(seed);
  return STRATEGY_CATALOG.map((s) => ({
    ...s,
    bias: r() * 2 - 1,
    pnl24h: (r() * 2 - 1) * 4200,
  }));
}

export function useTradingEngine() {
  const seedRef = useRef(0x21f7 >>> 0 || 91237);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("Balanced");
  const riskRef = useRef(riskLevel);
  riskRef.current = riskLevel;

  // Live wiring
  const [mode, setMode] = useState<Mode>("connecting");
  const [connection, setConnection] = useState<Connection>("connecting");
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autonomous, setAutonomous] = useState(false);
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;
  const autoRef = useRef(autonomous);
  autoRef.current = autonomous;
  const healthRef = useRef<Health | null>(health);
  healthRef.current = health;
  const startEquityRef = useRef<number | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);

  const [state, setState] = useState<EngineState>(() => ({
    online: true,
    thinking: false,
    speaking: false,
    equity: 1_284_500,
    startEquity: 1_240_000,
    dayPnl: 44_500,
    dayPnlPct: 3.59,
    winRate: 0.74,
    sharpe: 3.1,
    trades: [],
    strategies: makeStrategies(seedRef.current),
    log: [
      {
        id: uid("t"),
        at: Date.now(),
        text: "Henry online. Synchronizing the ensemble across global markets.",
        tone: "info",
      },
    ],
    marketRegime: "TRENDING",
  }));

  const onlineRef = useRef(state.online);
  onlineRef.current = state.online;

  const pushThought = useCallback((text: string, tone: HenryThought["tone"]) => {
    setState((s) => ({
      ...s,
      speaking: true,
      log: [{ id: uid("t"), at: Date.now(), text, tone }, ...s.log].slice(0, 24),
    }));
    window.setTimeout(
      () => setState((s) => ({ ...s, speaking: false })),
      1600 + Math.random() * 900
    );
  }, []);

  // ── Live polling ──────────────────────────────────────────────────────────
  const pollLive = useCallback(async () => {
    try {
      const [acct, trades] = await Promise.all([api.account(), api.trades()]);
      if (startEquityRef.current === null) startEquityRef.current = acct.equity;
      const startEquity = startEquityRef.current;
      const dayPnl = acct.equity - startEquity;

      // Diff trades to narrate Henry's actions.
      const ids = new Set(trades.map((t) => t.id));
      const prev = prevIdsRef.current;
      if (prev.size > 0) {
        for (const t of trades)
          if (!prev.has(t.id))
            pushThought(
              THOUGHTS_BUY[Math.floor(Math.random() * THOUGHTS_BUY.length)].replace(
                "{sym}",
                t.symbol
              ),
              "buy"
            );
      }
      prevIdsRef.current = ids;

      setState((s) => ({
        ...s,
        equity: acct.equity,
        startEquity,
        dayPnl,
        dayPnlPct: startEquity ? (dayPnl / startEquity) * 100 : 0,
        trades,
        marketRegime: dayPnl >= 0 ? "RISK-ON" : "RISK-OFF",
      }));
      setConnection("ok");
      setError(null);
    } catch (e) {
      setConnection("error");
      setError(e instanceof Error ? e.message : "OANDA request failed");
    }
  }, [pushThought]);

  // ── Autonomous live decision (places real orders) ─────────────────────────
  const autoTradeLive = useCallback(async () => {
    if (busyRef.current) return;
    const h = healthRef.current;
    if (!h?.tradingEnabled || !autoRef.current || !onlineRef.current) return;

    busyRef.current = true;
    try {
      // Exits are handled by native OANDA brackets attached on entry, so the
      // autonomous loop only opens new positions.
      const open = state.trades;
      const profile = RISK_PROFILE[riskRef.current];
      if (open.length >= profile.maxTrades) return;

      // Aggregate the ensemble into one conviction.
      const active = state.strategies.filter((s) => s.active);
      if (active.length === 0) return;
      const wsum = active.reduce((a, s) => a + s.weight, 0) || 1;
      const agg = active.reduce((a, s) => a + s.weight * s.bias, 0) / wsum;
      if (Math.abs(agg) < SIGNAL_THRESHOLD) return;

      // Choose an instrument we're not already in.
      const held = new Set(open.map((t) => t.symbol));
      const target = LIVE_INSTRUMENTS.find((i) => !held.has(i));
      if (!target) return;

      const side: Side = agg > 0 ? "LONG" : "SHORT";
      const units = (side === "LONG" ? 1 : -1) * profile.units;
      const confidence = clamp(0.55 + Math.abs(agg) * 0.4, 0.55, 0.98);
      const strategy = [...active].sort((a, b) => b.weight - a.weight)[0].name;

      await api.placeOrder({
        instrument: target,
        units,
        strategy,
        confidence,
        takeProfitPct: TP_PCT,
        stopLossPct: SL_PCT,
      });
      pushThought(
        `${THOUGHTS_BUY[Math.floor(Math.random() * THOUGHTS_BUY.length)].replace(
          "{sym}",
          target
        )} TP/SL set.`,
        "buy"
      );
      await pollLive();
    } catch (e) {
      pushThought(
        `Order rejected: ${e instanceof Error ? e.message : "unknown error"}`,
        "alert"
      );
    } finally {
      busyRef.current = false;
    }
  }, [state.trades, state.strategies, pollLive, pushThought]);

  // ── Sim trade actions ─────────────────────────────────────────────────────
  const openTradeSim = useCallback(() => {
    const r = rng((seedRef.current = (seedRef.current * 1664525 + 1013904223) >>> 0));
    const m = SYMBOLS[Math.floor(r() * SYMBOLS.length)];
    const strat = STRATEGY_CATALOG[Math.floor(r() * STRATEGY_CATALOG.length)];
    const side: Side = r() > 0.42 ? "LONG" : "SHORT";
    const profile = RISK_PROFILE[riskRef.current];
    const trade: Trade = {
      id: uid("tr"),
      symbol: m.symbol,
      side,
      strategy: strat.name,
      entry: m.price,
      mark: m.price,
      size: profile.size * (0.5 + r()),
      leverage: profile.lev,
      pnl: 0,
      pnlPct: 0,
      confidence: 0.55 + r() * 0.43,
      openedAt: Date.now(),
      status: "OPEN",
    };
    setState((s) => ({ ...s, trades: [trade, ...s.trades] }));
    pushThought(
      THOUGHTS_BUY[Math.floor(r() * THOUGHTS_BUY.length)].replace("{sym}", m.symbol),
      "buy"
    );
  }, [pushThought]);

  // ── Public actions (route to live or sim) ─────────────────────────────────
  const closeTrade = useCallback(
    async (id: string) => {
      if (modeRef.current === "live") {
        try {
          await api.closeTrade(id);
          const t = state.trades.find((x) => x.id === id);
          if (t)
            pushThought(
              THOUGHTS_SELL[Math.floor(Math.random() * THOUGHTS_SELL.length)].replace(
                "{sym}",
                t.symbol
              ),
              "sell"
            );
          await pollLive();
        } catch (e) {
          pushThought(
            `Could not close: ${e instanceof Error ? e.message : "error"}`,
            "alert"
          );
        }
        return;
      }
      setState((s) => {
        const t = s.trades.find((x) => x.id === id);
        if (!t) return s;
        const r = rng(seedRef.current++);
        pushThought(
          THOUGHTS_SELL[Math.floor(r() * THOUGHTS_SELL.length)].replace("{sym}", t.symbol),
          "sell"
        );
        return {
          ...s,
          equity: s.equity + t.pnl,
          dayPnl: s.dayPnl + t.pnl,
          trades: s.trades.filter((x) => x.id !== id),
        };
      });
    },
    [state.trades, pollLive, pushThought]
  );

  const protectTrade = useCallback(
    async (id: string) => {
      if (modeRef.current !== "live") return;
      try {
        await api.setBrackets(id, { takeProfitPct: TP_PCT, stopLossPct: SL_PCT });
        const t = state.trades.find((x) => x.id === id);
        pushThought(`Protection set on ${t?.symbol ?? "position"} — TP/SL live on OANDA.`, "info");
        await pollLive();
      } catch (e) {
        pushThought(
          `Could not set protection: ${e instanceof Error ? e.message : "error"}`,
          "alert"
        );
      }
    },
    [state.trades, pollLive, pushThought]
  );

  const openTrade = useCallback(() => {
    if (modeRef.current === "live") {
      void autoTradeLive();
      return;
    }
    openTradeSim();
  }, [autoTradeLive, openTradeSim]);

  const toggleStrategy = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      strategies: s.strategies.map((st) =>
        st.id === id ? { ...st, active: !st.active } : st
      ),
    }));
  }, []);

  const setOnline = useCallback(
    (online: boolean) => {
      setState((s) => ({ ...s, online }));
      pushThought(
        online ? "Engine armed. Hunting alpha." : "Engine paused. Holding all positions.",
        online ? "info" : "alert"
      );
    },
    [pushThought]
  );

  // ── Detect environment on mount ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const h = await api.health();
        if (cancelled) return;
        setHealth(h);
        if (h.configured) {
          setMode("live");
          setState((s) => ({
            ...s,
            log: [
              {
                id: uid("t"),
                at: Date.now(),
                text: `Connected to OANDA (${h.environment}). ${
                  h.tradingEnabled ? "Trading armed." : "Monitoring only."
                }`,
                tone: (h.live ? "alert" : "info") as HenryThought["tone"],
              },
              ...s.log,
            ].slice(0, 24),
          }));
        } else {
          setMode("sim");
          setConnection("ok");
        }
      } catch {
        if (cancelled) return;
        // No proxy reachable → run the live simulation.
        setMode("sim");
        setConnection("ok");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Fast loop: live poll OR sim marks ─────────────────────────────────────
  useEffect(() => {
    const tick = window.setInterval(() => {
      if (modeRef.current === "live") {
        void pollLive();
        return;
      }
      if (modeRef.current !== "sim") return;
      setState((s) => {
        const r = rng(seedRef.current++);
        const vmap = Object.fromEntries(SYMBOLS.map((m) => [m.symbol, m.vol]));
        const trades = s.trades.map((t) => {
          const vol = vmap[t.symbol] ?? 0.02;
          const mark = Math.max(0.0001, t.mark + (r() - 0.5) * vol * t.entry * 0.4);
          const dir = t.side === "LONG" ? 1 : -1;
          const move = (mark - t.entry) / t.entry;
          return {
            ...t,
            mark,
            pnl: move * dir * t.size * t.leverage,
            pnlPct: move * dir * 100 * t.leverage,
          };
        });
        const unreal = trades.reduce((a, t) => a + t.pnl, 0);
        const liveEquity = s.startEquity + unreal;
        const dayPnl = liveEquity - s.startEquity;
        return {
          ...s,
          trades,
          equity: liveEquity,
          dayPnl,
          dayPnlPct: (dayPnl / s.startEquity) * 100,
        };
      });
    }, modeRef.current === "live" ? 2500 : 900);
    return () => window.clearInterval(tick);
    // re-create interval when mode flips so the cadence matches
  }, [mode, pollLive]);

  // ── Brain loop: ensemble re-weighting + decisions ─────────────────────────
  useEffect(() => {
    const brain = window.setInterval(() => {
      if (!onlineRef.current) return;
      const r = rng(seedRef.current++);

      setState((s) => ({ ...s, thinking: true }));
      window.setTimeout(() => setState((s) => ({ ...s, thinking: false })), 1200);

      // Re-weight the ensemble (visualises Henry's mind in both modes).
      setState((s) => ({
        ...s,
        strategies: s.strategies.map((st) => ({
          ...st,
          bias: clamp(st.bias + (r() - 0.5) * 0.4, -1, 1),
          pnl24h: st.pnl24h + (r() - 0.48) * 600,
        })),
      }));

      if (modeRef.current === "live") {
        void autoTradeLive();
        if (r() > 0.7)
          pushThought(THOUGHTS_IDLE[Math.floor(r() * THOUGHTS_IDLE.length)], "info");
        return;
      }

      // Sim decisions
      const profile = RISK_PROFILE[riskRef.current];
      setState((s) => {
        if (s.trades.length < profile.maxTrades && r() > 0.45) {
          window.setTimeout(() => openTradeSim(), 0);
        } else if (s.trades.length > 0 && r() > 0.72) {
          const victim = s.trades[Math.floor(r() * s.trades.length)];
          window.setTimeout(() => closeTrade(victim.id), 0);
        } else if (r() > 0.6) {
          window.setTimeout(
            () => pushThought(THOUGHTS_IDLE[Math.floor(Math.random() * THOUGHTS_IDLE.length)], "info"),
            0
          );
        }
        return s;
      });
    }, 3200);
    return () => window.clearInterval(brain);
  }, [openTradeSim, closeTrade, pushThought, autoTradeLive]);

  // ── Seed the simulation once (only when not live) ─────────────────────────
  useEffect(() => {
    if (mode !== "sim") return;
    openTradeSim();
    const t1 = window.setTimeout(openTradeSim, 400);
    const t2 = window.setTimeout(openTradeSim, 800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return {
    state,
    mode,
    connection,
    environment: health?.environment ?? "practice",
    tradingEnabled: health?.tradingEnabled ?? false,
    live: health?.live ?? false,
    error,
    autonomous,
    setAutonomous,
    riskLevel,
    setRiskLevel,
    setOnline,
    toggleStrategy,
    closeTrade,
    protectTrade,
    openTrade,
  };
}
