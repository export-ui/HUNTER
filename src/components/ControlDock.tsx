import { Pause, Play, Shield, Zap, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

type RiskLevel = "Guarded" | "Balanced" | "Aggressive";

interface Props {
  online: boolean;
  riskLevel: RiskLevel;
  onToggleOnline: (v: boolean) => void;
  onRisk: (r: RiskLevel) => void;
}

const RISKS: { key: RiskLevel; icon: typeof Shield }[] = [
  { key: "Guarded", icon: Shield },
  { key: "Balanced", icon: Gauge },
  { key: "Aggressive", icon: Zap },
];

export default function ControlDock({ online, riskLevel, onToggleOnline, onRisk }: Props) {
  return (
    <div className="glass flex flex-wrap items-center justify-between gap-3 p-3">
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
  );
}
