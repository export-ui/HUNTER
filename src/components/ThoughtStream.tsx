import { Sparkles } from "lucide-react";
import type { HenryThought } from "@/types";
import { cn } from "@/lib/utils";

const toneDot: Record<HenryThought["tone"], string> = {
  info: "bg-rift-azure",
  buy: "bg-rift-mint",
  sell: "bg-rift-rose",
  alert: "bg-rift-amber",
};

const timeAgo = (at: number) => {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.round(s / 60)}m`;
};

export default function ThoughtStream({ log }: { log: HenryThought[] }) {
  return (
    <div className="glass flex min-h-0 flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={15} className="text-rift-violet" />
        <h3 className="font-display text-sm font-semibold tracking-wide">Henry's Mind</h3>
      </div>
      <div className="-mr-2 flex-1 space-y-2.5 overflow-y-auto pr-2">
        {log.map((l) => (
          <div key={l.id} className="flex items-start gap-2.5 text-sm">
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", toneDot[l.tone])} />
            <p className="leading-snug text-rift-ink/80">
              {l.text}
              <span className="ml-1.5 text-[10px] text-rift-muted">{timeAgo(l.at)}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
