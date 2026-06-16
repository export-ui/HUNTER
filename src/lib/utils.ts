import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmtUsd = (n: number, max = 2) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: max,
    maximumFractionDigits: max,
  });

export const fmtNum = (n: number, max = 2) =>
  n.toLocaleString("en-US", { maximumFractionDigits: max, minimumFractionDigits: 0 });

export const fmtPct = (n: number, max = 2) =>
  `${n >= 0 ? "+" : ""}${n.toLocaleString("en-US", {
    maximumFractionDigits: max,
    minimumFractionDigits: max,
  })}%`;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Mulberry32 deterministic PRNG so the demo feels alive but reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
