import { Pause, Play, Shield, Zap, Gauge, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

type RiskLevel = "Guarded" | "Balanced" | "Aggressive";

interface Props {
  online: boolean;
  riskLevel: RiskLevel;
  onToggleOnline: (v: boolean) => void;
  onRisk: (r: RiskLevel) => void;
  showAutonomous?: boolean;
  autonomous?: boolean;
  tradingEnabled?: boolean;
  onAutonomous?: (v: boolean) => void;
}

const RISKS: { key: RiskLevel; icon: typeof Shield }[] = [
  { key: "Guarded", icon: Shield },
  { key: "Balanced", icon: Gauge },
  { key: "Aggressive", icon: Zap },
];

export default function ControlDock({
  online,
  riskLevel,
  onToggleOnline,
  onRisk,
  showAutonomous,
  autonomous,
  tradingEnabled,
  onAutonomous,
}: Props) {
  return (
    <div className="glass flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => onToggleOnline(!online)}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition active:scale-95",
            online
              ? "bg-gradient-to-r from-rift-azure to-rift-violet"
              : "bg-gradient-to-r from-rift-muted to-rift-ink/70"
          )}
        >
          {online ? <Pause size={16} /> : <Play size={16} />}
          {online ? "Hunting" : "Paused"}
        </button>

        <div className="flex items-center gap-1 rounded-xl bg-rift-bg/70 p-1">
          {RISKS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onRisk(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                riskLevel === key
                  ? "bg-white text-rift-ink shadow-sm"
                  : "text-rift-muted hover:text-rift-ink"
              )}
            >
              <Icon size={13} />
              {key}
            </button>
          ))}
        </div>
      </div>

      {showAutonomous && (
        <button
          disabled={!tradingEnabled}
          onClick={() => onAutonomous?.(!autonomous)}
          className={cn(
            "flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition",
            !tradingEnabled
              ? "cursor-not-allowed border-rift-line bg-rift-bg/60 opacity-60"
              : autonomous
                ? "border-rift-mint/40 bg-rift-mint/10"
                : "border-rift-line bg-white/60 hover:border-rift-azure/40"
          )}
        >
          <span className="flex items-center gap-2">
            <Bot size={16} className={autonomous ? "text-rift-mint" : "text-rift-muted"} />
            <span className="text-sm font-medium">
              Autonomous trading
              <span className="block text-[10px] text-rift-muted">
                {!tradingEnabled
                  ? "Locked — set ALLOW_TRADING=true on the server"
                  : autonomous
                    ? "Henry is placing real orders"
                    : "Henry will only monitor"}
              </span>
            </span>
          </span>
          <span
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition",
              autonomous && tradingEnabled ? "bg-rift-mint" : "bg-rift-line"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                autonomous && tradingEnabled ? "left-[18px]" : "left-0.5"
              )}
            />
          </span>
        </button>
      )}
    </div>
  );
}
