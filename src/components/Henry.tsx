import HenryParticles from "./HenryParticles";
import { cn } from "@/lib/utils";
import type { EngineState } from "@/types";

interface Props {
  state: EngineState;
}

export default function Henry({ state }: Props) {
  const status = !state.online
    ? "Paused"
    : state.speaking
      ? "Speaking"
      : state.thinking
        ? "Thinking"
        : "Watching the markets";

  const latest = state.log[0];

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center">
      {/* Ambient rings */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[78%] w-[78%] rounded-full border border-rift-violet/15" />
        <div className="absolute h-[60%] w-[60%] rounded-full border border-rift-azure/15" />
        <div
          className={cn(
            "absolute h-[60%] w-[60%] rounded-full border-2 border-rift-violet/30",
            state.online && "animate-pulse-ring"
          )}
        />
      </div>

      {/* Particle canvas */}
      <HenryParticles
        speaking={state.speaking}
        thinking={state.thinking}
        online={state.online}
        className="relative z-10 h-full w-full"
      />

      {/* Name + status */}
      <div className="pointer-events-none absolute left-1/2 top-5 z-20 -translate-x-1/2 text-center">
        <div className="font-display text-lg font-semibold tracking-[0.3em] text-rift-ink/80">
          HENRY
        </div>
        <div className="mt-0.5 flex items-center justify-center gap-1.5 text-xs text-rift-muted">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              state.online ? "bg-rift-mint" : "bg-rift-muted"
            )}
          />
          {status}
        </div>
      </div>

      {/* Live thought caption */}
      {latest && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 w-[88%] -translate-x-1/2 text-center">
          <div
            key={latest.id}
            className="animate-fade-up rounded-2xl border border-white/70 bg-white/70 px-4 py-2.5 text-sm font-medium text-rift-ink/90 shadow-soft backdrop-blur-md"
          >
            <span className="mr-1.5 text-rift-violet">“</span>
            {latest.text}
            <span className="ml-0.5 text-rift-violet">”</span>
          </div>
        </div>
      )}
    </div>
  );
}
