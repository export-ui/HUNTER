import type { StrategySignal } from "@/types";
import { cn, fmtUsd } from "@/lib/utils";

interface Props {
  strategies: StrategySignal[];
  onToggle: (id: string) => void;
}

export default function StrategyPanel({ strategies, onToggle }: Props) {
  return (
    <div className="glass p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold tracking-wide">Strategy Ensemble</h3>
        <span className="chip bg-rift-violet/10 text-rift-violet">
          {strategies.filter((s) => s.active).length}/{strategies.length} live
        </span>
      </div>

      <div className="space-y-2.5">
        {strategies.map((s) => {
          const longBias   = s.bias >= 0;
          const confPct    = Math.round((s.confidence ?? 0.5) * 100);
          const strongSig  = Math.abs(s.bias) > 0.45 && (s.confidence ?? 0) > 0.55;

          return (
            <button
              key={s.id}
              onClick={() => onToggle(s.id)}
              className={cn(
                "group block w-full rounded-xl border p-2.5 text-left transition",
                s.active
                  ? strongSig
                    ? "border-rift-mint/40 bg-rift-mint/6 hover:border-rift-azure/40"
                    : "border-rift-line bg-white/70 hover:border-rift-azure/40"
                  : "border-dashed border-rift-line/70 bg-white/30 opacity-55 hover:opacity-80"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    s.active
                      ? strongSig ? "bg-rift-mint animate-pulse" : "bg-rift-mint"
                      : "bg-rift-muted"
                  )} />
                  <span className="text-sm font-medium">{s.name}</span>
                  {strongSig && s.active && (
                    <span className={cn(
                      "rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide",
                      longBias ? "bg-rift-mint/15 text-rift-mint" : "bg-rift-rose/15 text-rift-rose"
                    )}>
                      {longBias ? "LONG" : "SHORT"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-rift-muted">{confPct}%</span>
                  <span className={cn("text-xs font-semibold", s.pnl24h >= 0 ? "text-rift-mint" : "text-rift-rose")}>
                    {s.pnl24h >= 0 ? "+" : ""}{fmtUsd(s.pnl24h, 0)}
                  </span>
                </div>
              </div>

              <p className="mt-1 line-clamp-1 text-[11px] text-rift-muted">{s.description}</p>

              {/* bias meter */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] uppercase text-rift-rose/70">S</span>
                <div className="relative h-1.5 flex-1 rounded-full bg-rift-line">
                  <div className="absolute left-1/2 top-1/2 h-2.5 w-px -translate-y-1/2 bg-rift-muted/40" />
                  <div
                    className={cn("absolute top-0 h-1.5 rounded-full transition-all duration-500",
                      longBias ? "bg-rift-mint" : "bg-rift-rose")}
                    style={{
                      left:  longBias ? "50%" : `${50 + s.bias * 50}%`,
                      width: `${Math.abs(s.bias) * 50}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] uppercase text-rift-mint/70">L</span>
              </div>

              {/* confidence bar */}
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[10px] text-rift-muted">Conf</span>
                <div className="relative h-1 flex-1 rounded-full bg-rift-line">
                  <div
                    className="absolute left-0 top-0 h-1 rounded-full bg-rift-azure/60 transition-all duration-500"
                    style={{ width: `${(s.confidence ?? 0.5) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-rift-muted">{confPct}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
