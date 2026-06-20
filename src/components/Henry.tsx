import { Volume2, VolumeX } from "lucide-react";
import HenryParticles from "./HenryParticles";
import { cn } from "@/lib/utils";
import type { EngineState } from "@/types";

interface Props {
  state: EngineState;
  voiceOn: boolean;
  onToggleVoice: () => void;
  voiceSupported: boolean;
}

export default function Henry({ state, voiceOn, onToggleVoice, voiceSupported }: Props) {
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
      {/* Particle orb */}
      <HenryParticles
        speaking={state.speaking}
        thinking={state.thinking}
        online={state.online}
        className="absolute inset-0 z-0 h-full w-full"
      />

      {/* Top bar: name + voice toggle */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-5">
        <div>
          <div className="font-display text-lg font-semibold tracking-[0.4em] text-rift-ink/85">
            HENRY
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-rift-muted">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                state.online ? "bg-rift-mint shadow-[0_0_8px_2px_rgba(47,208,166,0.5)]" : "bg-rift-muted"
              )}
            />
            {status}
            {state.speaking && (
              <span className="ml-1 flex items-end gap-0.5">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="w-0.5 rounded-full bg-rift-violet"
                    style={{
                      height: 6,
                      animation: `eq 0.7s ease-in-out ${i * 0.12}s infinite alternate`,
                    }}
                  />
                ))}
              </span>
            )}
          </div>
        </div>

        {voiceSupported && (
          <button
            onClick={onToggleVoice}
            className={cn(
              "pointer-events-auto flex h-9 w-9 items-center justify-center rounded-xl border backdrop-blur-md transition",
              voiceOn
                ? "border-rift-violet/40 bg-rift-violet/15 text-rift-violet"
                : "border-rift-line bg-white/60 text-rift-muted hover:text-rift-ink"
            )}
            title={voiceOn ? "Mute Henry" : "Let Henry speak"}
          >
            {voiceOn ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
        )}
      </div>

      {/* Live thought caption */}
      {latest && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 w-[88%] -translate-x-1/2 text-center">
          <div
            key={latest.id}
            className="animate-fade-up rounded-2xl border border-white/70 bg-white/70 px-4 py-2.5 text-sm font-medium text-rift-ink/90 shadow-soft backdrop-blur-xl"
          >
            <span className="mr-1.5 text-rift-violet">“</span>
            {latest.text}
            <span className="ml-0.5 text-rift-violet">”</span>
          </div>
        </div>
      )}

      <style>{`@keyframes eq{from{height:3px}to{height:13px}}`}</style>
    </div>
  );
}
