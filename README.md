# Rift Hunter 🛰️

An ultra-futuristic, tablet-friendly **AI trading intelligence** dashboard.

Meet **Henry** — a digital mind rendered entirely from glowing particles. He sits
solid at a luminous bar line and **dissolves downward into billions of dust-sized
particles**, drifting and shifting as he *thinks* and *speaks*. Around him orbit the
live data panels: open trades, the strategy ensemble, performance, and a real-time
stream of Henry's reasoning.

> Built on the Lovable stack — **Vite + React + TypeScript + Tailwind CSS** — so it
> drops straight into a Lovable project.

## ✨ What's inside

- **Henry, the particle AI** (`src/components/HenryParticles.tsx`)
  - A face/bust sampled into ~2,600 living particles on an HTML canvas.
  - A glowing **bar line** where he is solid; below it he fades into ~900 dust
    particles that fall and dissipate.
  - Reacts to state: gentle breathing when idle, turbulence while **thinking**,
    a moving mouth band while **speaking**.
- **Central + satellite layout** — Henry in the centre, data panels all around.
- **The Strategy Ensemble** (`src/lib/strategies.ts`) — six world-class strategies
  (Quantum Momentum, Mean Reversion, Liquidity Breakout, Cross-Venue Arb, Neural
  Sentiment, Volatility Harvest) blended into one AI decision, all running at once.
- **Live trading engine** (`src/hooks/useTradingEngine.ts`) — simulates marks,
  P&L, equity, opening/closing positions, regime shifts and Henry's thoughts.
- **Clean, light, futuristic** design system (glassmorphism, soft glows, pastel
  gradients) tuned for tablets.

## 🚀 Run it

```bash
npm install
npm run dev      # http://localhost:8080
npm run build    # production build
```

## 🔌 Going live (next steps)

The engine is currently a **realistic simulation** so the UI is fully alive with no
keys required. To trade real markets, replace the bodies in
`src/hooks/useTradingEngine.ts` with calls to your exchange/broker API (e.g. a
secured backend or Lovable's Supabase edge functions — never put API secrets in the
browser) and pipe real fills + marks into the same `EngineState` shape in
`src/types.ts`. Every component already renders from that state, so the visuals work
unchanged.

---

*Simulated performance is for demonstration only and is not financial advice.*
