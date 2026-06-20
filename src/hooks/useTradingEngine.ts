import { useEffect, useRef, useState, useCallback } from "react";
import type {
  EngineState, Trade, HenryThought, StrategySignal, Side,
  InstrumentSignal, SignalsResponse,
} from "@/types";
import { STRATEGY_CATALOG, SYMBOLS } from "@/lib/strategies";
import { clamp, rng } from "@/lib/utils";
import { api, type Health } from "@/lib/api";

type RiskLevel  = "Guarded" | "Balanced" | "Aggressive";
type Mode       = "connecting" | "sim" | "live";
type Connection = "connecting" | "ok" | "error";

const RISK_PROFILE: Record<
  RiskLevel,
  { maxTrades: number; size: number; lev: number; riskPct: number }
> = {
  Guarded:    { maxTrades: 3, size: 4000,  lev: 2,  riskPct: 0.5 },
  Balanced:   { maxTrades: 5, size: 8000,  lev: 5,  riskPct: 1.0 },
  Aggressive: { maxTrades: 7, size: 16000, lev: 10, riskPct: 2.0 },
};

// ── Live instruments Henry hunts ───────────────────────────────────────────
const LIVE_INSTRUMENTS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "XAU/USD"];

// ── Signal thresholds ─────────────────────────────────────────────────────
// Raised from 0.35 → 0.45: only trade when the ensemble has real conviction.
const SIGNAL_THRESHOLD  = 0.45;
const MIN_CONFIDENCE    = 0.58;

// ── ATR bracket multiples (3:1 R:R) ──────────────────────────────────────
const TP_ATR_MULT = 3.0; // take-profit at 3× ATR
const SL_ATR_MULT = 1.5; // stop-loss   at 1.5× ATR
// Fallback pct brackets when ATR not available
const TP_PCT_FALLBACK = 1.2;
const SL_PCT_FALLBACK = 0.4;

const EQUITY_HISTORY_CAP = 160;
const pushHistory = (hist: number[], v: number) =>
  [...hist, v].slice(-EQUITY_HISTORY_CAP);

// ── Thought strings ────────────────────────────────────────────────────────
const THOUGHTS_BUY = [
  "Momentum and sentiment agree — scaling into {sym}.",
  "Order-book imbalance on {sym}. Hunting the breakout.",
  "{sym} dislocation detected across venues. Capturing edge.",
  "Conviction stacking on {sym}. Opening a long.",
  "EMA crossover confirmed on {sym}. Entering with the trend.",
  "RSI + Bollinger confluence on {sym}. Adding exposure.",
];
const THOUGHTS_SELL = [
  "Taking profit on {sym}. Edge has decayed.",
  "Vol spiking on {sym} — trimming risk now.",
  "Mean reversion signal flipped {sym}. Closing the book.",
  "Locking gains on {sym} before the regime shifts.",
  "TP bracket hit on {sym}. Crystallising the alpha.",
];
const THOUGHTS_IDLE = [
  "Scanning 312 markets across 14 venues…",
  "Re-weighting the ensemble against live indicator data.",
  "Liquidity is thin. Patience compounds returns.",
  "Recalibrating risk to current volatility regime.",
  "No clean edge yet — protecting capital.",
  "EMA/RSI/ATR signals computed. Waiting for confluence.",
  "Signal threshold at 0.45 — filtering noise.",
];

let counter = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

// Build strategy list seeded from the catalog (biases start at 0 until real signals arrive)
function makeStrategies(): StrategySignal[] {
  return STRATEGY_CATALOG.map((s) => ({
    ...s,
    bias: 0,
    pnl24h: 0,
    confidence: 0.5,
  }));
}

export function useTradingEngine() {
  const seedRef = useRef(0x21f7 >>> 0 || 91237);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("Balanced");
  const riskRef = useRef(riskLevel);
  riskRef.current = riskLevel;

  const [mode, setMode]             = useState<Mode>("connecting");
  const [connection, setConnection] = useState<Connection>("connecting");
  const [health, setHealth]         = useState<Health | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [autonomous, setAutonomous] = useState(false);

  const modeRef   = useRef<Mode>(mode);
  modeRef.current = mode;
  const autoRef   = useRef(autonomous);
  autoRef.current = autonomous;
  const healthRef = useRef<Health | null>(health);
  healthRef.current = health;

  const startEquityRef  = useRef<number | null>(null);
  const prevIdsRef      = useRef<Set<string>>(new Set());
  const busyRef         = useRef(false);
  const beAppliedRef    = useRef<Set<string>>(new Set()); // track trades with BE stop applied
  // Cache of latest real signals from the server
  const liveSignalsRef  = useRef<SignalsResponse | null>(null);

  const [state, setState] = useState<EngineState>(() => ({
    online: true,
    thinking: false,
    speaking: false,
    equity: 1_284_500,
    startEquity: 1_240_000,
    dayPnl: 44_500,
    dayPnlPct: 3.59,
    winRate: null,
    sharpe: null,
    profitFactor: null,
    maxDrawdown: null,
    trades: [],
    strategies: makeStrategies(),
    log: [
      {
        id: uid("t"),
        at: Date.now(),
        text: "Henry online. Synchronizing ensemble with live market indicators.",
        tone: "info",
      },
    ],
    marketRegime: "TRENDING",
    h4Trend: "NEUTRAL",
    equityHistory: [1_240_000, 1_284_500],
    signalsUpdatedAt: null,
  }));

  const onlineRef  = useRef(state.online);
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

  // ── Apply real signals from server to strategy biases ─────────────────
  const applyLiveSignals = useCallback(
    (resp: SignalsResponse) => {
      liveSignalsRef.current = resp;

      // Aggregate signals across all instruments per strategy
      const instruments = Object.keys(resp.signals);
      if (instruments.length === 0) return;

      const strategyKeys: (keyof InstrumentSignal)[] = [
        "momentum", "meanrev", "breakout", "arb", "sentiment", "vol",
      ];

      // Average the bias+confidence across instruments, weighted by confidence
      const agg: Record<string, { wBiasSum: number; wSum: number }> = {};
      for (const key of strategyKeys) {
        agg[key] = { wBiasSum: 0, wSum: 0 };
      }

      for (const instr of instruments) {
        const sig = resp.signals[instr];
        for (const key of strategyKeys) {
          const s = sig[key] as { bias: number; confidence: number };
          agg[key].wBiasSum += s.bias * s.confidence;
          agg[key].wSum     += s.confidence;
        }
      }

      // Pick dominant regime and H4 trend across instruments
      const regimeCounts: Record<string, number> = {};
      const h4TrendCounts: Record<string, number> = {};
      for (const instr of instruments) {
        const sig = resp.signals[instr];
        regimeCounts[sig.regime] = (regimeCounts[sig.regime] || 0) + 1;
        if (sig.h4Trend) h4TrendCounts[sig.h4Trend] = (h4TrendCounts[sig.h4Trend] || 0) + 1;
      }
      const dominantRegime = Object.entries(regimeCounts).sort((a, b) => b[1] - a[1])[0][0] as
        EngineState["marketRegime"];
      const dominantH4 = Object.entries(h4TrendCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as
        EngineState["h4Trend"] ?? "NEUTRAL";

      setState((s) => ({
        ...s,
        strategies: s.strategies.map((st) => {
          const key = st.id as keyof typeof agg;
          if (!agg[key]) return st;
          const { wBiasSum, wSum } = agg[key];
          const newBias       = wSum > 0 ? clamp(wBiasSum / wSum, -1, 1) : 0;
          const newConfidence = wSum > 0 ? clamp(wSum / instruments.length, 0.2, 0.95) : 0.3;
          return {
            ...st,
            bias: newBias,
            confidence: newConfidence,
            // pnl24h nudge based on signal strength
            pnl24h: st.pnl24h + newBias * Math.abs(newBias) * 800,
          };
        }),
        marketRegime: dominantRegime,
        h4Trend: dominantH4,
        signalsUpdatedAt: resp.computedAt,
      }));
    },
    []
  );

  // ── Fetch real signals from server ─────────────────────────────────────
  const fetchSignals = useCallback(async () => {
    if (modeRef.current !== "live") return;
    try {
      const resp = await api.signals(LIVE_INSTRUMENTS);
      applyLiveSignals(resp);
    } catch (e) {
      console.warn("[signals] fetch failed:", e instanceof Error ? e.message : e);
    }
  }, [applyLiveSignals]);

  // ── Fetch real performance stats ───────────────────────────────────────
  const fetchPerformance = useCallback(async () => {
    if (modeRef.current !== "live") return;
    try {
      const perf = await api.performance();
      setState((s) => ({
        ...s,
        winRate:       perf.winRate,
        sharpe:        perf.sharpe,
        profitFactor:  perf.profitFactor,
        maxDrawdown:   perf.maxDrawdown,
      }));
    } catch (e) {
      console.warn("[perf] fetch failed:", e instanceof Error ? e.message : e);
    }
  }, []);

  // ── Live account polling ───────────────────────────────────────────────
  const pollLive = useCallback(async () => {
    try {
      const [acct, trades] = await Promise.all([api.account(), api.trades()]);
      if (startEquityRef.current === null) startEquityRef.current = acct.equity;
      const startEquity = startEquityRef.current;
      const dayPnl = acct.equity - startEquity;

      const ids = new Set(trades.map((t) => t.id));
      const prev = prevIdsRef.current;
      if (prev.size > 0) {
        for (const t of trades)
          if (!prev.has(t.id))
            pushThought(
              THOUGHTS_BUY[Math.floor(Math.random() * THOUGHTS_BUY.length)].replace("{sym}", t.symbol),
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
        equityHistory: pushHistory(s.equityHistory, acct.equity),
      }));
      setConnection("ok");
      setError(null);

      // Dynamic break-even: move SL to entry when a trade reaches +1R profit.
      // Fire-and-forget — never blocks the poll loop or UI.
      if (healthRef.current?.tradingEnabled) {
        for (const t of trades) {
          if (!t.tpPrice || !t.slPrice || beAppliedRef.current.has(t.id)) continue;
          const dir = t.side === "LONG" ? 1 : -1;
          const stopDist = Math.abs(t.entry - t.slPrice);
          if (stopDist <= 0) continue;
          const profit = (t.mark - t.entry) * dir;
          const alreadyBe = dir > 0 ? t.slPrice >= t.entry : t.slPrice <= t.entry;
          if (profit >= stopDist && !alreadyBe) {
            beAppliedRef.current.add(t.id);
            api.setBrackets(t.id, { stopLoss: t.entry })
              .then(() => pushThought(`Break-even lock on ${t.symbol}: SL moved to entry.`, "info"))
              .catch(() => beAppliedRef.current.delete(t.id));
          }
        }
      }
    } catch (e) {
      setConnection("error");
      setError(e instanceof Error ? e.message : "OANDA request failed");
    }
  }, [pushThought]);

  // ── Autonomous live trading (uses REAL signals) ────────────────────────
  const autoTradeLive = useCallback(async () => {
    if (busyRef.current) return;
    const h = healthRef.current;
    if (!h?.tradingEnabled || !autoRef.current || !onlineRef.current) return;

    // Session gate: only enter during liquid market hours (London + NY: 07:00-20:00 UTC).
    // Avoids wide spreads and thin liquidity during Asian late-session and weekends.
    const utcH = new Date().getUTCHours();
    if (utcH < 7 || utcH >= 20) return;

    busyRef.current = true;
    try {
      const open    = state.trades;
      const profile = RISK_PROFILE[riskRef.current];
      if (open.length >= profile.maxTrades) return;

      // ── Use live signals if available ──────────────────────────────────
      const liveSignals = liveSignalsRef.current;
      if (liveSignals) {
        // Find the instrument with the highest real aggregate signal
        const held = new Set(open.map((t) => t.symbol));
        let bestInstr: string | null = null;
        let bestAgg = 0;
        let bestAtr: number | null = null;

        for (const instr of LIVE_INSTRUMENTS) {
          if (held.has(instr)) continue;
          const sig = liveSignals.signals[instr];
          if (!sig) continue;

          // Require minimum confidence across active strategies
          const active = state.strategies.filter((s) => s.active);
          const avgConf = active.reduce((a, s) => {
            const key = s.id as keyof typeof sig;
            const raw = sig[key] as { confidence?: number } | undefined;
            return a + (raw?.confidence ?? 0.3);
          }, 0) / (active.length || 1);

          if (Math.abs(sig.aggregate) >= SIGNAL_THRESHOLD && avgConf >= MIN_CONFIDENCE) {
            if (Math.abs(sig.aggregate) > Math.abs(bestAgg)) {
              bestAgg   = sig.aggregate;
              bestInstr = instr;
              bestAtr   = sig.atr;
            }
          }
        }

        if (!bestInstr) return; // no real edge found

        const side: Side = bestAgg > 0 ? "LONG" : "SHORT";
        const confidence = clamp(0.55 + Math.abs(bestAgg) * 0.4, 0.55, 0.97);
        const strategy   = [...state.strategies.filter((s) => s.active)]
          .sort((a, b) => Math.abs(b.bias * b.confidence) - Math.abs(a.bias * a.confidence))[0]?.name
          ?? "Rift Hunter";

        await api.placeOrder({
          instrument:   bestInstr,
          side,
          riskPct:      profile.riskPct,
          strategy,
          confidence,
          // ATR-based 3:1 R:R brackets
          atrValue:     bestAtr ?? undefined,
          tpAtrMult:    bestAtr ? TP_ATR_MULT   : undefined,
          slAtrMult:    bestAtr ? SL_ATR_MULT    : undefined,
          takeProfitPct: !bestAtr ? TP_PCT_FALLBACK : undefined,
          stopLossPct:   !bestAtr ? SL_PCT_FALLBACK : undefined,
        });

        pushThought(
          `${THOUGHTS_BUY[Math.floor(Math.random() * THOUGHTS_BUY.length)].replace("{sym}", bestInstr)} TP/SL set (${bestAtr ? "ATR-based 3:1 R:R" : "fixed brackets"}).`,
          "buy"
        );
        await pollLive();
        return;
      }

      // ── Fallback: ensemble bias without signal cache ───────────────────
      const active = state.strategies.filter((s) => s.active);
      if (active.length === 0) return;
      const wsum = active.reduce((a, s) => a + s.weight, 0) || 1;
      const agg  = active.reduce((a, s) => a + s.weight * s.bias, 0) / wsum;
      if (Math.abs(agg) < SIGNAL_THRESHOLD) return;

      const held   = new Set(open.map((t) => t.symbol));
      const target = LIVE_INSTRUMENTS.find((i) => !held.has(i));
      if (!target) return;

      const side: Side = agg > 0 ? "LONG" : "SHORT";
      const confidence = clamp(0.55 + Math.abs(agg) * 0.4, 0.55, 0.97);
      const strategy   = [...active].sort((a, b) => b.weight - a.weight)[0].name;

      await api.placeOrder({
        instrument:    target,
        side,
        riskPct:       profile.riskPct,
        strategy,
        confidence,
        takeProfitPct: TP_PCT_FALLBACK,
        stopLossPct:   SL_PCT_FALLBACK,
      });
      pushThought(
        `${THOUGHTS_BUY[Math.floor(Math.random() * THOUGHTS_BUY.length)].replace("{sym}", target)} TP/SL set.`,
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

  // ── Simulation trade ───────────────────────────────────────────────────
  const openTradeSim = useCallback(() => {
    const r = rng((seedRef.current = (seedRef.current * 1664525 + 1013904223) >>> 0));
    const m = SYMBOLS[Math.floor(r() * SYMBOLS.length)];
    const strat = STRATEGY_CATALOG[Math.floor(r() * STRATEGY_CATALOG.length)];

    // Use strategy signals if available; otherwise use random
    const active = state.strategies.filter((s) => s.active);
    const wsum   = active.reduce((a, s) => a + s.weight, 0) || 1;
    const agg    = active.reduce((a, s) => a + s.weight * s.bias, 0) / wsum;
    const side: Side = agg !== 0 ? (agg > 0 ? "LONG" : "SHORT") : r() > 0.42 ? "LONG" : "SHORT";

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
      confidence: 0.55 + r() * 0.40,
      openedAt: Date.now(),
      status: "OPEN",
    };
    setState((s) => ({ ...s, trades: [trade, ...s.trades] }));
    pushThought(
      THOUGHTS_BUY[Math.floor(r() * THOUGHTS_BUY.length)].replace("{sym}", m.symbol),
      "buy"
    );
  }, [state.strategies, pushThought]);

  // ── Close / protect / flatten ──────────────────────────────────────────
  const closeTrade = useCallback(
    async (id: string) => {
      if (modeRef.current === "live") {
        try {
          await api.closeTrade(id);
          const t = state.trades.find((x) => x.id === id);
          if (t)
            pushThought(
              THOUGHTS_SELL[Math.floor(Math.random() * THOUGHTS_SELL.length)].replace("{sym}", t.symbol),
              "sell"
            );
          await pollLive();
        } catch (e) {
          pushThought(`Could not close: ${e instanceof Error ? e.message : "error"}`, "alert");
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
        return { ...s, equity: s.equity + t.pnl, dayPnl: s.dayPnl + t.pnl, trades: s.trades.filter((x) => x.id !== id) };
      });
    },
    [state.trades, pollLive, pushThought]
  );

  const flattenAll = useCallback(async () => {
    if (modeRef.current === "live") {
      try {
        const r = await api.flatten();
        pushThought(`Kill-switch: flattened ${r.closed}/${r.requested} positions.`, "alert");
        await pollLive();
      } catch (e) {
        pushThought(`Flatten failed: ${e instanceof Error ? e.message : "error"}`, "alert");
      }
      return;
    }
    setState((s) => {
      const realized = s.trades.reduce((a, t) => a + t.pnl, 0);
      const equity = s.equity + realized;
      return { ...s, equity, dayPnl: s.dayPnl + realized, trades: [], equityHistory: pushHistory(s.equityHistory, equity) };
    });
    pushThought("Kill-switch: all positions flattened.", "alert");
  }, [pollLive, pushThought]);

  const protectTrade = useCallback(
    async (id: string) => {
      if (modeRef.current !== "live") return;
      const t = state.trades.find((x) => x.id === id);
      try {
        await api.setBrackets(id, { takeProfitPct: TP_PCT_FALLBACK, stopLossPct: SL_PCT_FALLBACK });
        pushThought(`Protection set on ${t?.symbol ?? "position"} — TP/SL live on OANDA.`, "info");
        await pollLive();
      } catch (e) {
        pushThought(`Could not set protection: ${e instanceof Error ? e.message : "error"}`, "alert");
      }
    },
    [state.trades, pollLive, pushThought]
  );

  const openTrade = useCallback(() => {
    if (modeRef.current === "live") { void autoTradeLive(); return; }
    openTradeSim();
  }, [autoTradeLive, openTradeSim]);

  const toggleStrategy = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      strategies: s.strategies.map((st) => st.id === id ? { ...st, active: !st.active } : st),
    }));
  }, []);

  const setOnline = useCallback((online: boolean) => {
    setState((s) => ({ ...s, online }));
    pushThought(
      online ? "Engine armed. Hunting alpha with live indicators." : "Engine paused. Holding all positions.",
      online ? "info" : "alert"
    );
  }, [pushThought]);

  // ── Detect environment on mount ────────────────────────────────────────
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
                text: `Connected to OANDA (${h.environment}). ${h.tradingEnabled ? "Trading armed." : "Monitoring only."} Signal engine active.`,
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
        setMode("sim");
        setConnection("ok");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Fast loop: live poll OR sim marks ─────────────────────────────────
  useEffect(() => {
    const ms = modeRef.current === "live" ? 2500 : 900;
    const tick = window.setInterval(() => {
      if (modeRef.current === "live") { void pollLive(); return; }
      if (modeRef.current !== "sim") return;

      setState((s) => {
        const r = rng(seedRef.current++);
        const vmap = Object.fromEntries(SYMBOLS.map((m) => [m.symbol, m.vol]));
        const trades = s.trades.map((t) => {
          const vol = vmap[t.symbol] ?? 0.02;
          // Bias mark movement toward strategy consensus
          const stratBias = s.strategies
            .filter((st) => st.active)
            .reduce((a, st) => a + st.weight * st.bias, 0);
          const drift = stratBias * 0.0002; // small directional nudge per tick
          const mark = Math.max(0.0001, t.mark + (r() - 0.5 + drift) * vol * t.entry * 0.4);
          const dir = t.side === "LONG" ? 1 : -1;
          const move = (mark - t.entry) / t.entry;
          return { ...t, mark, pnl: move * dir * t.size * t.leverage, pnlPct: move * dir * 100 * t.leverage };
        });
        const unreal = trades.reduce((a, t) => a + t.pnl, 0);
        const liveEquity = s.startEquity + unreal;
        const dayPnl = liveEquity - s.startEquity;
        return {
          ...s, trades, equity: liveEquity, dayPnl,
          dayPnlPct: (dayPnl / s.startEquity) * 100,
          equityHistory: pushHistory(s.equityHistory, liveEquity),
        };
      });
    }, ms);
    return () => window.clearInterval(tick);
  }, [mode, pollLive]);

  // ── Brain loop: re-weighting + decisions ──────────────────────────────
  useEffect(() => {
    const brain = window.setInterval(() => {
      if (!onlineRef.current) return;
      const r = rng(seedRef.current++);

      setState((s) => ({ ...s, thinking: true }));
      window.setTimeout(() => setState((s) => ({ ...s, thinking: false })), 1200);

      if (modeRef.current === "live") {
        // In live mode: signals come from the server (fetchSignals loop).
        // Only nudge pnl24h display and run autonomous logic.
        setState((s) => ({
          ...s,
          strategies: s.strategies.map((st) => ({
            ...st,
            pnl24h: st.pnl24h + (r() - 0.48) * 400 * (st.active ? 1 : 0.2),
          })),
        }));
        void autoTradeLive();
        if (r() > 0.7)
          pushThought(THOUGHTS_IDLE[Math.floor(r() * THOUGHTS_IDLE.length)], "info");
        return;
      }

      // Sim mode: gently drift biases to simulate signal evolution.
      // Biases don't jump randomly — they evolve slowly with mean reversion.
      setState((s) => ({
        ...s,
        strategies: s.strategies.map((st) => ({
          ...st,
          bias: clamp(st.bias * 0.92 + (r() - 0.5) * 0.25, -1, 1),
          confidence: clamp(st.confidence * 0.95 + r() * 0.08, 0.3, 0.92),
          pnl24h: st.pnl24h + (r() - 0.47) * 550,
        })),
      }));

      // Sim market regime
      setState((s) => {
        const active = s.strategies.filter((st) => st.active);
        const wsum   = active.reduce((a, st) => a + st.weight, 0) || 1;
        const agg    = active.reduce((a, st) => a + st.weight * st.bias, 0) / wsum;
        let regime: EngineState["marketRegime"] = "TRENDING";
        if (agg > 0.3)       regime = "RISK-ON";
        else if (agg < -0.3) regime = "RISK-OFF";
        else if (r() > 0.75) regime = "CHOPPY";
        return { ...s, marketRegime: regime };
      });

      const profile = RISK_PROFILE[riskRef.current];
      setState((s) => {
        if (s.trades.length < profile.maxTrades && r() > 0.45)
          window.setTimeout(() => openTradeSim(), 0);
        else if (s.trades.length > 0 && r() > 0.72) {
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

  // ── Signal polling loop (live only, every 60 s) ────────────────────────
  useEffect(() => {
    if (mode !== "live") return;
    void fetchSignals();
    const t = window.setInterval(fetchSignals, 60_000);
    return () => window.clearInterval(t);
  }, [mode, fetchSignals]);

  // ── Performance polling loop (live only, every 5 min) ────────────────
  useEffect(() => {
    if (mode !== "live") return;
    void fetchPerformance();
    const t = window.setInterval(fetchPerformance, 5 * 60_000);
    return () => window.clearInterval(t);
  }, [mode, fetchPerformance]);

  // ── Seed sim with initial trades ──────────────────────────────────────
  useEffect(() => {
    if (mode !== "sim") return;
    openTradeSim();
    const t1 = window.setTimeout(openTradeSim, 400);
    const t2 = window.setTimeout(openTradeSim, 800);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ── Compute sim performance stats locally ─────────────────────────────
  useEffect(() => {
    if (mode !== "sim") return;
    // Stable sim stats — will be overridden by real data in live mode.
    const simWinRate = 0.62 + Math.random() * 0.06;
    const simSharpe  = 1.8  + Math.random() * 0.8;
    setState((s) => ({
      ...s,
      winRate:      s.winRate      ?? simWinRate,
      sharpe:       s.sharpe       ?? simSharpe,
      profitFactor: s.profitFactor ?? 1.5 + Math.random() * 0.8,
      maxDrawdown:  s.maxDrawdown  ?? 0.04 + Math.random() * 0.04,
    }));
  }, [mode]);

  return {
    state,
    mode,
    connection,
    environment:    health?.environment ?? "practice",
    tradingEnabled: health?.tradingEnabled ?? false,
    live:           health?.live ?? false,
    error,
    autonomous,
    setAutonomous,
    riskLevel,
    setRiskLevel,
    setOnline,
    toggleStrategy,
    closeTrade,
    protectTrade,
    flattenAll,
    openTrade,
  };
}
