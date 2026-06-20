import { useEffect, useRef, useState } from "react";
import {
  Activity, Wallet, Target, TrendingUp, Layers, Wifi, WifiOff,
  AlertTriangle, BarChart3, ShieldCheck,
} from "lucide-react";
import { useTradingEngine } from "@/hooks/useTradingEngine";
import { speak, stopSpeaking, voiceSupported } from "@/lib/voice";
import Henry from "@/components/Henry";
import StatTile from "@/components/StatTile";
import TradeCard from "@/components/TradeCard";
import StrategyPanel from "@/components/StrategyPanel";
import ThoughtStream from "@/components/ThoughtStream";
import ControlDock from "@/components/ControlDock";
import EquityChart from "@/components/EquityChart";
import BacktestPanel from "@/components/BacktestPanel";
import { fmtUsd, fmtPct, cn } from "@/lib/utils";

export default function App() {
  const {
    state,
    mode,
    connection,
    environment,
    tradingEnabled,
    live,
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
  } = useTradingEngine();

  const up     = state.dayPnl >= 0;
  const isLive = mode === "live";

  // Henry's voice — narrate each new thought aloud.
  const [voiceOn, setVoiceOn]   = useState(true);
  const [showBacktest, setShowBacktest] = useState(false);
  const lastSpoke = useRef<string | null>(null);

  useEffect(() => {
    const latest = state.log[0];
    if (!voiceOn || !latest || lastSpoke.current === latest.id) return;
    lastSpoke.current = latest.id;
    speak(latest.text);
  }, [state.log, voiceOn]);

  useEffect(() => { if (!voiceOn) stopSpeaking(); }, [voiceOn]);

  // Format performance stats — show real values in live mode, computed sim values otherwise
  const winRateDisplay    = state.winRate    != null ? `${Math.round(state.winRate * 100)}%`        : "—";
  const sharpeDisplay     = state.sharpe     != null ? state.sharpe.toFixed(2)                      : "—";
  const pfDisplay         = state.profitFactor != null ? state.profitFactor.toFixed(2) + "x"        : "—";
  const winRateSub        = isLive ? "Live OANDA closed trades"    : "Simulated (30d)";
  const sharpeSub         = isLive ? "Annualised from daily returns" : "Risk-adjusted return";
  const signalAge         = state.signalsUpdatedAt
    ? `Signals: ${Math.round((Date.now() - state.signalsUpdatedAt) / 1000)}s ago`
    : null;

  return (
    <div className="grid-glow min-h-screen w-full">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-4 p-4 lg:p-6">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-rift-sky via-rift-azure to-rift-violet shadow-glow">
              <Activity size={22} className="text-white" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">Rift Hunter</h1>
              <p className="text-xs text-rift-muted">Autonomous AI trading intelligence</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isLive ? (
              <span className={cn("chip", live ? "bg-rift-rose/12 text-rift-rose" : "bg-rift-azure/12 text-rift-azure")}>
                {connection === "error" ? <WifiOff size={12} /> : <Wifi size={12} />}
                OANDA · {environment.toUpperCase()}
                {live ? " · REAL$" : ""}
              </span>
            ) : (
              <span className="chip bg-rift-amber/12 text-rift-amber">
                <Activity size={12} /> DEMO · simulated
              </span>
            )}
            <span className="chip bg-rift-mint/12 text-rift-mint">
              <span className="h-1.5 w-1.5 rounded-full bg-rift-mint" />
              {state.marketRegime}
            </span>
            {isLive && (
              <span className={cn("chip text-[10px]",
                state.h4Trend === "BULL" ? "bg-rift-mint/12 text-rift-mint"
                : state.h4Trend === "BEAR" ? "bg-rift-rose/12 text-rift-rose"
                : "bg-white/70 text-rift-muted"
              )}>
                H4: {state.h4Trend}
              </span>
            )}
            {signalAge && (
              <span className="chip bg-rift-violet/10 text-rift-violet text-[10px]">
                <ShieldCheck size={11} /> {signalAge}
              </span>
            )}
            <span className="chip bg-white/70 text-rift-muted backdrop-blur">
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </span>
            <button
              onClick={() => setShowBacktest((v) => !v)}
              className={cn(
                "chip transition",
                showBacktest
                  ? "bg-rift-violet/20 text-rift-violet"
                  : "bg-white/70 text-rift-muted hover:text-rift-violet"
              )}
            >
              <BarChart3 size={12} /> Backtester
            </button>
          </div>
        </header>

        {/* Connection error banner */}
        {isLive && connection === "error" && (
          <div className="flex items-center gap-2 rounded-2xl border border-rift-rose/30 bg-rift-rose/10 px-4 py-2.5 text-sm text-rift-rose">
            <AlertTriangle size={16} />
            <span className="font-medium">OANDA connection problem:</span>
            <span className="text-rift-rose/90">{error}</span>
          </div>
        )}

        {/* ── Stat strip ──────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatTile icon={Wallet}    label="Equity"           value={fmtUsd(state.equity, 0)}  sub="Total portfolio value"  tone="violet" />
          <StatTile icon={TrendingUp} label="Today's P&L"     value={`${up ? "+" : ""}${fmtUsd(state.dayPnl, 0)}`}
            sub={fmtPct(state.dayPnlPct)} tone={up ? "up" : "down"} />
          <StatTile icon={Target}    label="Win Rate"         value={winRateDisplay}            sub={winRateSub} />
          <StatTile icon={Activity}  label="Sharpe"           value={sharpeDisplay}             sub={sharpeSub} />
          <StatTile icon={BarChart3} label="Profit Factor"    value={pfDisplay}                 sub="Gross wins / losses" />
          <StatTile icon={Layers}    label="Open Positions"   value={String(state.trades.length)} sub="Across global markets" />
        </section>

        {/* ── Core grid ───────────────────────────────────────────────── */}
        <section className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-12">

          {/* Left — controls + equity + strategies */}
          <div className="order-2 flex flex-col gap-4 lg:order-1 lg:col-span-3">
            <ControlDock
              online={state.online}
              riskLevel={riskLevel}
              onToggleOnline={setOnline}
              onRisk={setRiskLevel}
              showAutonomous={isLive}
              autonomous={autonomous}
              tradingEnabled={tradingEnabled}
              onAutonomous={setAutonomous}
              hasOpenTrades={state.trades.length > 0}
              onFlatten={flattenAll}
            />
            <EquityChart
              data={state.equityHistory}
              dayPnl={state.dayPnl}
              dayPnlPct={state.dayPnlPct}
            />
            <StrategyPanel strategies={state.strategies} onToggle={toggleStrategy} />
          </div>

          {/* Center — Henry */}
          <div className="order-1 lg:order-2 lg:col-span-5">
            <div className="glass relative h-[440px] overflow-hidden sm:h-[520px] lg:h-full lg:min-h-[520px]">
              <Henry
                state={state}
                voiceOn={voiceOn}
                onToggleVoice={() => setVoiceOn((v) => !v)}
                voiceSupported={voiceSupported}
              />
            </div>
          </div>

          {/* Right — open trades + thought stream */}
          <div className="order-3 flex flex-col gap-4 lg:col-span-4">
            <div className="glass flex min-h-0 flex-col p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold tracking-wide">Open Trades</h3>
                <div className="flex items-center gap-2">
                  {state.maxDrawdown != null && (
                    <span className={cn("chip text-[10px]",
                      state.maxDrawdown < 0.05 ? "bg-rift-mint/10 text-rift-mint" : "bg-rift-rose/10 text-rift-rose")}>
                      DD: {fmtPct(-state.maxDrawdown * 100)}
                    </span>
                  )}
                  <span className="chip bg-rift-azure/10 text-rift-azure">{state.trades.length} live</span>
                </div>
              </div>
              <div className="-mr-2 grid max-h-[280px] grid-cols-1 gap-3 overflow-y-auto pr-2 sm:grid-cols-2">
                {state.trades.length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-rift-muted">
                    No open positions. Henry is hunting for a real edge…
                  </p>
                )}
                {state.trades.map((t) => (
                  <TradeCard
                    key={t.id}
                    trade={t}
                    onClose={closeTrade}
                    canProtect={isLive && tradingEnabled}
                    onProtect={protectTrade}
                  />
                ))}
              </div>
            </div>

            <div className="min-h-[220px] flex-1">
              <ThoughtStream log={state.log} />
            </div>
          </div>
        </section>

        {/* ── Backtester (collapsible) ────────────────────────────────── */}
        {showBacktest && (
          <section>
            <BacktestPanel />
          </section>
        )}

        <footer className="pb-1 pt-2 text-center text-[11px] text-rift-muted">
          Rift Hunter · Real indicators (EMA/RSI/ATR/BB/MACD) · 3:1 R:R brackets · ATR-based position sizing · Not financial advice.
        </footer>
      </div>
    </div>
  );
}
