import { Activity, Wallet, Target, TrendingUp, Layers, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { useTradingEngine } from "@/hooks/useTradingEngine";
import Henry from "@/components/Henry";
import StatTile from "@/components/StatTile";
import TradeCard from "@/components/TradeCard";
import StrategyPanel from "@/components/StrategyPanel";
import ThoughtStream from "@/components/ThoughtStream";
import ControlDock from "@/components/ControlDock";
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
  } = useTradingEngine();

  const up = state.dayPnl >= 0;
  const isLive = mode === "live";

  return (
    <div className="grid-glow min-h-screen w-full">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
        {/* ── Header ───────────────────────────────────────────── */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-rift-sky via-rift-azure to-rift-violet shadow-glow">
              <Activity size={22} className="text-white" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">
                Rift&nbsp;Hunter
              </h1>
              <p className="text-xs text-rift-muted">
                Autonomous AI trading intelligence
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Live / demo + connection */}
            {isLive ? (
              <span
                className={cn(
                  "chip",
                  live ? "bg-rift-rose/12 text-rift-rose" : "bg-rift-azure/12 text-rift-azure"
                )}
              >
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
            <span className="chip bg-white/70 text-rift-muted backdrop-blur">
              {new Date().toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
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

        {/* ── Stat strip ───────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatTile
            icon={Wallet}
            label="Equity"
            value={fmtUsd(state.equity, 0)}
            sub="Total portfolio value"
            tone="violet"
          />
          <StatTile
            icon={TrendingUp}
            label="Today's P&L"
            value={`${up ? "+" : ""}${fmtUsd(state.dayPnl, 0)}`}
            sub={fmtPct(state.dayPnlPct)}
            tone={up ? "up" : "down"}
          />
          <StatTile
            icon={Target}
            label="Win Rate"
            value={isLive ? "—" : `${Math.round(state.winRate * 100)}%`}
            sub={isLive ? "Live account" : "Trailing 30 days"}
          />
          <StatTile
            icon={Activity}
            label="Sharpe"
            value={isLive ? "—" : state.sharpe.toFixed(2)}
            sub="Risk-adjusted return"
          />
          <StatTile
            icon={Layers}
            label="Open Positions"
            value={String(state.trades.length)}
            sub="Across global markets"
          />
        </section>

        {/* ── Core grid ────────────────────────────────────────── */}
        <section className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left — strategies + controls */}
          <div className="flex flex-col gap-4 lg:col-span-3">
            <ControlDock
              online={state.online}
              riskLevel={riskLevel}
              onToggleOnline={setOnline}
              onRisk={setRiskLevel}
              showAutonomous={isLive}
              autonomous={autonomous}
              tradingEnabled={tradingEnabled}
              onAutonomous={setAutonomous}
            />
            <StrategyPanel strategies={state.strategies} onToggle={toggleStrategy} />
          </div>

          {/* Center — Henry */}
          <div className="lg:col-span-5">
            <div className="glass relative h-[420px] overflow-hidden lg:h-full lg:min-h-[520px]">
              <Henry state={state} />
            </div>
          </div>

          {/* Right — open trades + mind */}
          <div className="flex flex-col gap-4 lg:col-span-4">
            <div className="glass flex min-h-0 flex-col p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold tracking-wide">
                  Open Trades
                </h3>
                <span className="chip bg-rift-azure/10 text-rift-azure">
                  {state.trades.length} live
                </span>
              </div>
              <div className="-mr-2 grid max-h-[280px] grid-cols-1 gap-3 overflow-y-auto pr-2 sm:grid-cols-2">
                {state.trades.length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-rift-muted">
                    No open positions. Henry is hunting for an edge…
                  </p>
                )}
                {state.trades.map((t) => (
                  <TradeCard key={t.id} trade={t} onClose={closeTrade} />
                ))}
              </div>
            </div>

            <div className="min-h-[220px] flex-1">
              <ThoughtStream log={state.log} />
            </div>
          </div>
        </section>

        <footer className="pb-1 pt-2 text-center text-[11px] text-rift-muted">
          Rift Hunter · Henry runs the world's best strategies, all at once. Simulated
          performance for demonstration — not financial advice.
        </footer>
      </div>
    </div>
  );
}
