import { useMemo } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn, fmtUsd, fmtPct } from "@/lib/utils";

interface Props {
  data: number[];
  dayPnl: number;
  dayPnlPct: number;
}

const W = 600;
const H = 120;

export default function EquityChart({ data, dayPnl, dayPnlPct }: Props) {
  const up = dayPnl >= 0;
  const { line, area } = useMemo(() => {
    if (data.length < 2) return { line: "", area: "" };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const stepX = W / (data.length - 1);
    const pts = data.map((v, i) => {
      const x = i * stepX;
      const y = H - 8 - ((v - min) / span) * (H - 16);
      return [x, y] as const;
    });
    const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${W},${H} L0,${H} Z`;
    return { line, area };
  }, [data]);

  const stroke = up ? "#2fd0a6" : "#ff6b8b";

  return (
    <div className="glass relative overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-rift-muted">
            Portfolio Equity
          </div>
          <div className="stat-value leading-tight">{fmtUsd(data[data.length - 1] ?? 0, 0)}</div>
        </div>
        <div className={cn("flex items-center gap-1.5 text-sm font-semibold", up ? "text-rift-mint" : "text-rift-rose")}>
          {up ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          <span>
            {up ? "+" : ""}
            {fmtUsd(dayPnl, 0)}
          </span>
          <span className="text-xs font-medium opacity-80">({fmtPct(dayPnlPct)})</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-3 h-24 w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && <path d={area} fill="url(#equityFill)" />}
        {line && (
          <path
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}
