import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "up" | "down" | "violet";
}

const toneMap = {
  neutral: "text-rift-ink",
  up: "text-rift-mint",
  down: "text-rift-rose",
  violet: "text-rift-violet",
};

export default function StatTile({ icon: Icon, label, value, sub, tone = "neutral" }: Props) {
  return (
    <div className="glass flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rift-sky/15 to-rift-violet/15 text-rift-azure">
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-rift-muted">{label}</div>
        <div className={cn("stat-value leading-tight", toneMap[tone])}>{value}</div>
        {sub && <div className="text-[11px] text-rift-muted">{sub}</div>}
      </div>
    </div>
  );
}
