import { useState, useCallback } from "react";
import { FlaskConical, TrendingUp, Trophy, AlertTriangle } from "lucide-react";
import { runBacktest } from "@/lib/backtest";
import { STRATEGY_CATALOG } from "@/lib/strategies";
import type { BacktestResult, BacktestConfig } from "@/types";
import { cn, fmtUsd, fmtPct } from "@/lib/utils";

const fmt2 = (n: number) => n.toFixed(2);
const fmtPctRaw = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

const SYMBOLS = ["EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD"];
const DAY_OPTIONS = [30, 90, 180, 365];

export default function BacktestPanel() {
  const [stratId, setStratId]   = useState("momentum");
  const [symbol, setSymbol]     = useState("EUR/USD");
  const [days, setDays]         = useState(90);
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState<BacktestResult | null>(null);

  const run = useCallback(() => {
    setRunning(true);
    // Yield to the browser so the spinner renders
    window.setTimeout(() => {
      const config: BacktestConfig = {
        strategyId:    stratId,
        symbol,
        days,
        riskPct:       1.0,
        tpAtr:         3.0,
        slAtr:         1.5,
        initialEquity: 100_000,
      };
      const r = runBacktest(config);
      setResult(r);
      setRunning(false);
    }, 50);
  }, [stratId, symbol, days]);

  const wins   = result?.trades.filter((t) => t.result === "WIN").length ?? 0;
  const losses = result?.trades.filter((t) => t.result === "LOSS").length ?? 0;
  const up     = (result?.totalReturnPct ?? 0) >= 0;

  // Normalize equity curve to a 0..100 height range for sparkline
  const eq = result?.equityHistory ?? [];
  const eqMin = eq.length > 0 ? Math.min(...eq) : 0;
  const eqMax = eq.length > 0 ? Math.max(...eq) : 1;
  const eqRange = eqMax - eqMin || 1;

  function sparkPath() {
    if (eq.length < 2) return "";
    const w = 100 / (eq.length - 1);
    return eq
      .map((v, i) => {
        const x = i * w;
        const y = 100 - ((v - eqMin) / eqRange) * 90 - 5;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }

  return (
    <div className="glass p-4">
      <div className="mb-4 flex items-center gap-2">
        <FlaskConical size={16} className="text-rift-violet" />
        <h3 className="font-display text-sm font-semibold tracking-wide">Strategy Backtester</h3>
        <span className="chip bg-rift-violet/10 text-rift-violet text-[10px]">3:1 R:R · ATR stops</span>
      </div>

      {/* Config row */}
      <div className="mb-3 flex flex-wrap gap-2">
        <select
          value={stratId}
          onChange={(e) => setStratId(e.target.value)}
          className="rounded-lg border border-rift-line bg-white/70 px-2 py-1.5 text-xs font-medium text-rift-ink focus:outline-none"
        >
          {STRATEGY_CATALOG.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="rounded-lg border border-rift-line bg-white/70 px-2 py-1.5 text-xs font-medium text-rift-ink focus:outline-none"
        >
          {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <div className="flex rounded-lg border border-rift-line bg-rift-bg/70 p-0.5">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition",
                days === d ? "bg-white text-rift-ink shadow-sm" : "text-rift-muted hover:text-rift-ink"
              )}
            >
              {d}d
            </button>
          ))}
        </div>

        <button
          onClick={run}
          disabled={running}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition active:scale-95",
            running
              ? "bg-rift-muted"
              : "bg-gradient-to-r from-rift-azure to-rift-violet hover:opacity-90"
          )}
        >
          {running ? "Running…" : "Run Backtest"}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Equity sparkline */}
          <div className="relative overflow-hidden rounded-xl bg-rift-bg/60 p-3">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="h-20 w-full"
            >
              <path d={sparkPath()} fill="none"
                stroke={up ? "#22d3a0" : "#f87171"} strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="mt-1 flex items-end justify-between">
              <span className="text-[10px] text-rift-muted">{fmtUsd(eqMin, 0)}</span>
              <span className={cn("text-sm font-bold", up ? "text-rift-mint" : "text-rift-rose")}>
                {fmtPctRaw(result.totalReturnPct)}
              </span>
              <span className="text-[10px] text-rift-muted">{fmtUsd(eqMax, 0)}</span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              { label: "Trades",  value: String(result.trades.length), sub: `${wins}W · ${losses}L` },
              { label: "Win Rate",value: `${(result.winRate * 100).toFixed(0)}%`, sub: result.winRate >= 0.55 ? "Good" : "Low" },
              { label: "Profit F",value: fmt2(result.profitFactor), sub: result.profitFactor >= 1.5 ? "Strong" : "Weak" },
              { label: "Sharpe",  value: fmt2(result.sharpe), sub: result.sharpe >= 1.5 ? "Strong" : result.sharpe >= 0.8 ? "OK" : "Low" },
              { label: "Max DD",  value: fmtPct(-result.maxDrawdown * 100), sub: result.maxDrawdown < 0.08 ? "Managed" : "High" },
              { label: "Calmar",  value: fmt2(result.calmar), sub: result.calmar >= 1 ? "Excellent" : "Fair" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl bg-white/60 p-2 text-center">
                <div className="text-[10px] text-rift-muted">{label}</div>
                <div className="mt-0.5 font-display text-sm font-bold">{value}</div>
                <div className="text-[9px] text-rift-muted">{sub}</div>
              </div>
            ))}
          </div>

          {/* Signal / verdict */}
          <div className={cn(
            "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm",
            result.sharpe >= 1.5 && result.profitFactor >= 1.5
              ? "border-rift-mint/30 bg-rift-mint/8 text-rift-mint"
              : result.sharpe >= 0.8
              ? "border-rift-amber/30 bg-rift-amber/8 text-rift-amber"
              : "border-rift-rose/30 bg-rift-rose/8 text-rift-rose"
          )}>
            {result.sharpe >= 1.5 && result.profitFactor >= 1.5
              ? <Trophy size={14} />
              : result.sharpe >= 0.8
              ? <TrendingUp size={14} />
              : <AlertTriangle size={14} />}
            <span className="text-xs font-medium">
              {result.sharpe >= 1.5 && result.profitFactor >= 1.5
                ? `Validated — ${STRATEGY_CATALOG.find(s => s.id === stratId)?.name} is deployable on ${symbol} (Sharpe ${fmt2(result.sharpe)}, PF ${fmt2(result.profitFactor)})`
                : result.sharpe >= 0.8
                ? `Marginal edge — monitor closely before live deployment (Sharpe ${fmt2(result.sharpe)})`
                : `Insufficient edge on ${symbol} — consider a different instrument or strategy`}
            </span>
          </div>
        </div>
      )}

      {!result && !running && (
        <p className="py-4 text-center text-xs text-rift-muted">
          Select a strategy and instrument, then run the backtest to validate before going live.
        </p>
      )}
    </div>
  );
}
