import { useEffect, useRef, useState, useCallback } from "react";
import type { EngineState, Trade, HenryThought, StrategySignal, Side } from "@/types";
import { STRATEGY_CATALOG, SYMBOLS } from "@/lib/strategies";
import { clamp, rng } from "@/lib/utils";

type RiskLevel = "Guarded" | "Balanced" | "Aggressive";

const RISK_PROFILE: Record<RiskLevel, { maxTrades: number; size: number; lev: number }> = {
  Guarded: { maxTrades: 4, size: 4000, lev: 2 },
  Balanced: { maxTrades: 6, size: 8000, lev: 5 },
  Aggressive: { maxTrades: 8, size: 16000, lev: 10 },
};

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
    // Henry stops "speaking" shortly after a thought lands.
    window.setTimeout(
      () => setState((s) => ({ ...s, speaking: false })),
      1600 + Math.random() * 900
    );
  }, []);

  const openTrade = useCallback(() => {
    const r = rng((seedRef.current = (seedRef.current * 1664525 + 1013904223) >>> 0));
    const m = SYMBOLS[Math.floor(r() * SYMBOLS.length)];
    const strat = STRATEGY_CATALOG[Math.floor(r() * STRATEGY_CATALOG.length)];
    const side: Side = r() > 0.42 ? "LONG" : "SHORT";
    const profile = RISK_PROFILE[riskRef.current];
    const size = profile.size * (0.5 + r());
    const lev = profile.lev;
    const trade: Trade = {
      id: uid("tr"),
      symbol: m.symbol,
      side,
      strategy: strat.name,
      entry: m.price,
      mark: m.price,
      size,
      leverage: lev,
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

  const closeTrade = useCallback(
    (id: string) => {
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
    [pushThought]
  );

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

  // Fast loop: tick marks, P&L and equity.
  useEffect(() => {
    const tick = window.setInterval(() => {
      setState((s) => {
        const r = rng(seedRef.current++);
        const vmap = Object.fromEntries(SYMBOLS.map((m) => [m.symbol, m.vol]));
        let liveEquity = s.equity;
        const trades = s.trades.map((t) => {
          const vol = vmap[t.symbol] ?? 0.02;
          const drift = (r() - 0.5) * vol * t.entry * 0.4;
          const mark = Math.max(0.0001, t.mark + drift);
          const dir = t.side === "LONG" ? 1 : -1;
          const move = (mark - t.entry) / t.entry;
          const pnl = move * dir * t.size * t.leverage;
          const pnlPct = move * dir * 100 * t.leverage;
          return { ...t, mark, pnl, pnlPct };
        });
        const unreal = trades.reduce((a, t) => a + t.pnl, 0);
        liveEquity = s.startEquity + (s.dayPnl - 0) + unreal;
        const dayPnl = liveEquity - s.startEquity;
        return {
          ...s,
          trades,
          equity: liveEquity,
          dayPnl,
          dayPnlPct: (dayPnl / s.startEquity) * 100,
        };
      });
    }, 900);
    return () => window.clearInterval(tick);
  }, []);

  // Slow loop: Henry thinks, opens/closes trades, re-weights strategies.
  useEffect(() => {
    const brain = window.setInterval(() => {
      if (!onlineRef.current) return;
      const r = rng(seedRef.current++);

      // a flicker of "thinking"
      setState((s) => ({ ...s, thinking: true }));
      window.setTimeout(() => setState((s) => ({ ...s, thinking: false })), 1200);

      setState((s) => {
        const regimes: EngineState["marketRegime"][] = [
          "RISK-ON",
          "RISK-OFF",
          "CHOPPY",
          "TRENDING",
        ];
        const strategies = s.strategies.map((st) => ({
          ...st,
          bias: clamp(st.bias + (r() - 0.5) * 0.4, -1, 1),
          pnl24h: st.pnl24h + (r() - 0.48) * 600,
        }));
        return {
          ...s,
          strategies,
          marketRegime:
            r() > 0.82 ? regimes[Math.floor(r() * regimes.length)] : s.marketRegime,
        };
      });

      const profile = RISK_PROFILE[riskRef.current];
      setState((s) => {
        const open = s.trades.length;
        if (open < profile.maxTrades && r() > 0.45) {
          // open via the dedicated path on next microtask to reuse logic
          window.setTimeout(() => openTrade(), 0);
        } else if (open > 0 && r() > 0.72) {
          const victim = s.trades[Math.floor(r() * s.trades.length)];
          window.setTimeout(() => closeTrade(victim.id), 0);
        } else if (r() > 0.6) {
          window.setTimeout(
            () =>
              pushThought(
                THOUGHTS_IDLE[Math.floor(Math.random() * THOUGHTS_IDLE.length)],
                "info"
              ),
            0
          );
        }
        return s;
      });
    }, 3200);
    return () => window.clearInterval(brain);
  }, [openTrade, closeTrade, pushThought]);

  // Seed a few starter trades once.
  useEffect(() => {
    openTrade();
    const t1 = window.setTimeout(openTrade, 400);
    const t2 = window.setTimeout(openTrade, 800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state,
    riskLevel,
    setRiskLevel,
    setOnline,
    toggleStrategy,
    closeTrade,
    openTrade,
  };
}
