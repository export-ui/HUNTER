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

## 🔌 Going live with OANDA

Rift Hunter ships with a **secure OANDA v20 proxy** (`server/index.mjs`). Your API
token lives **only on the server** — never in the browser — and the frontend talks
to the proxy. With no credentials set, the dashboard automatically runs the
realistic **demo simulation**; the moment the proxy is configured it flips to your
**real OANDA account**.

### 1. Add your credentials

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable             | What it is                                                        |
| -------------------- | ----------------------------------------------------------------- |
| `OANDA_API_TOKEN`    | OANDA v20 token (Account → *Manage API Access* → Generate)        |
| `OANDA_ACCOUNT_ID`   | e.g. `001-001-1234567-001`                                         |
| `OANDA_ENVIRONMENT`  | `practice` (demo) or `live` (real money). Defaults to `practice`. |
| `ALLOW_TRADING`      | `false` = monitor only. `true` = allow placing/closing orders.    |
| `VITE_API_BASE`      | URL the browser uses to reach the proxy (default `:8787`).         |

> These are the **same credentials your account already uses** — paste the existing
> OANDA token + account id. Nothing about your OANDA account changes; the proxy just
> reads/acts on it on your behalf.

### 2. Run it

```bash
npm install
npm run dev:all      # web (:8080) + OANDA proxy (:8787) together
```

Open the app. The header badge shows **OANDA · PRACTICE** (or **LIVE · REAL$**) once
connected. Stat tiles, open trades and marks now come straight from OANDA. The **X**
on any trade card closes the real position.

### 3. Let Henry trade autonomously

Live order execution is **off by default** and double-gated for safety:

1. Set `ALLOW_TRADING=true` on the server, **and**
2. Flip the **Autonomous trading** switch in the dashboard.

Then Henry blends the strategy ensemble into a single conviction and places real
**market orders** on `EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, XAU/USD`.
Position size and the max number of concurrent trades follow the
**Guarded / Balanced / Aggressive** risk selector.

#### Native take-profit / stop-loss (server-side brackets)

Every autonomous order is submitted with **OANDA bracket orders attached on fill**
(`takeProfitOnFill` / `stopLossOnFill`). Because the brackets live on **OANDA's
servers**, your positions stay protected even if the app, the proxy, or your
machine goes offline. Defaults are `DEFAULT_TP_PCT=0.8` and `DEFAULT_SL_PCT=0.4`
(price-distance %), tunable in `.env`. Protected trades show a 🛡 with their TP/SL
on the card.

For positions opened elsewhere, hit **Add TP/SL** on the trade card (live + trading
armed) and the proxy attaches brackets to that existing trade via
`PUT /api/trades/:id/brackets`.

> ⚠️ `OANDA_ENVIRONMENT=live` + `ALLOW_TRADING=true` + Autonomous **trades real
> money**. Start on `practice` and confirm behaviour before going live.

### Safety model

- Token never reaches the browser (server-side bearer injection only).
- `.env` is gitignored — secrets are never committed.
- Monitoring is always read-only; trading requires the explicit server flag.
- Orders Henry places are tagged `rift-hunter` in OANDA for easy auditing.

---

*Simulated performance is for demonstration only and is not financial advice.*
