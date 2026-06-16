import { ArrowDownRight, ArrowUpRight, X } from "lucide-react";
import type { Trade } from "@/types";
import { cn, fmtUsd, fmtPct, fmtNum } from "@/lib/utils";

interface Props {
  trade: Trade;
  onClose: (id: string) => void;
}

export default function TradeCard({ trade, onClose }: Props) {
  const up = trade.pnl >= 0;
  const long = trade.side === "LONG";

  return (
    <div className="group glass-soft relative overflow-hidden p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-soft">
      {/* conviction accent */}
      <div
        className="absolute inset-x-0 top-0 h-0.5"
        style={{
          background: `linear-gradient(90deg, transparent, ${
            up ? "#2fd0a6" : "#ff6b8b"
          } ${Math.round(trade.confidence * 100)}%, transparent)`,
        }}
      />

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold",
              long ? "bg-rift-mint/15 text-rift-mint" : "bg-rift-rose/15 text-rift-rose"
            )}
          >
            {long ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
          </span>
          <div>
            <div className="font-display text-sm font-semibold leading-none">
              {trade.symbol}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-rift-muted">
              {trade.side} · {trade.leverage}x
            </div>
          </div>
        </div>
        <button
          onClick={() => onClose(trade.id)}
          className="rounded-md p-1 text-rift-muted opacity-0 transition group-hover:opacity-100 hover:bg-rift-rose/10 hover:text-rift-rose"
          aria-label="Close position"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className={cn("font-display text-lg font-semibold", up ? "text-rift-mint" : "text-rift-rose")}>
            {up ? "+" : ""}
            {fmtUsd(trade.pnl)}
          </div>
          <div className={cn("text-xs font-medium", up ? "text-rift-mint" : "text-rift-rose")}>
            {fmtPct(trade.pnlPct)}
          </div>
        </div>
        <div className="text-right text-[10px] text-rift-muted">
          <div>entry {fmtNum(trade.entry, trade.entry < 10 ? 4 : 2)}</div>
          <div>mark {fmtNum(trade.mark, trade.mark < 10 ? 4 : 2)}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-rift-line/70 pt-2">
        <span className="chip bg-rift-azure/10 text-rift-azure">{trade.strategy}</span>
        <span className="text-[10px] text-rift-muted">
          conv {Math.round(trade.confidence * 100)}%
        </span>
      </div>
    </div>
  );
}
