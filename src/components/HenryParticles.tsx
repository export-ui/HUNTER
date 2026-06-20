import { useEffect, useRef } from "react";

interface Props {
  speaking: boolean;
  thinking: boolean;
  online: boolean;
  className?: string;
}

// Gradient palette (sky -> azure -> violet -> highlight) sampled into sprites.
const PALETTE = ["#5aa9ff", "#3f86f7", "#5f74f6", "#8a7bff", "#a9b8ff", "#e8f0ff"];
const DUST = ["#9db9ff", "#b9a9ff", "#c4d3ff"];

function makeSprite(color: string, dim = 32): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = dim;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(dim / 2, dim / 2, 0, dim / 2, dim / 2, dim / 2);
  grd.addColorStop(0, color);
  grd.addColorStop(0.4, color);
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(dim / 2, dim / 2, dim / 2, 0, Math.PI * 2);
  g.fill();
  return c;
}

interface P3 {
  x: number;
  y: number;
  z: number;
  lat: number; // 0..1 latitude for colouring
  phase: number;
}
interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  sprite: number;
}

export default function HenryParticles({ speaking, thinking, online, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = useRef({ speaking, thinking, online });
  st.current = { speaking, thinking, online };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const sprites = PALETTE.map((c) => makeSprite(c));
    const dustSprites = DUST.map((c) => makeSprite(c, 22));

    let W = 0,
      H = 0,
      cx = 0,
      cyOrb = 0,
      barY = 0,
      R = 0;
    let pts: P3[] = [];
    const rings: P3[][] = [];
    let dust: Dust[] = [];
    let raf = 0;
    let t = 0;
    let rot = 0;
    let energy = 0; // smoothed activity level

    const fib = (n: number, jitter = 0): P3[] => {
      const out: P3[] = [];
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const th = golden * i;
        const j = 1 + (Math.random() - 0.5) * jitter;
        out.push({
          x: Math.cos(th) * r * j,
          y: y * j,
          z: Math.sin(th) * r * j,
          lat: (y + 1) / 2,
          phase: Math.random() * Math.PI * 2,
        });
      }
      return out;
    };

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, Math.floor(rect.width));
      H = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      barY = H * 0.66;
      R = Math.min(W, H) * 0.3;
      cx = W / 2;
      cyOrb = barY - R * 1.04;

      pts = fib(Math.min(1700, Math.floor((W * H) / 700)), 0.04);
      rings.length = 0;
      // flowing orbital streams (great-circle rings at slightly larger radius)
      for (let k = 0; k < 3; k++) {
        const ring: P3[] = [];
        const count = 120;
        const tilt = (k / 3) * Math.PI;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          const x = Math.cos(a) * 1.16;
          const z = Math.sin(a) * 1.16;
          // tilt around X
          const y = z * Math.sin(tilt);
          const z2 = z * Math.cos(tilt);
          ring.push({ x, y, z: z2, lat: (y + 1) / 2, phase: tilt });
        }
        rings.push(ring);
      }
      dust = Array.from({ length: 520 }, () => spawnDust(true));
    };

    function spawnDust(init = false): Dust {
      const ox = cx + (Math.random() - 0.5) * R * 1.6;
      const maxLife = 60 + Math.random() * 110;
      return {
        x: ox,
        y: barY + (init ? Math.random() * (H - barY) : (Math.random() - 0.5) * 6),
        vx: (Math.random() - 0.5) * 0.5,
        vy: 0.25 + Math.random() * 1.0,
        size: 0.5 + Math.random() * 1.6,
        life: init ? Math.random() * maxLife : 0,
        maxLife,
        sprite: Math.floor(Math.random() * dustSprites.length),
      };
    }

    const project = (p: P3, rad: number) => {
      // rotate around Y
      const cosR = Math.cos(rot),
        sinR = Math.sin(rot);
      let x = p.x * cosR - p.z * sinR;
      let z = p.x * sinR + p.z * cosR;
      // fixed tilt around X
      const tilt = -0.42;
      const y = p.y * Math.cos(tilt) - z * Math.sin(tilt);
      z = p.y * Math.sin(tilt) + z * Math.cos(tilt);
      const persp = 1 / (1.8 - z * 0.6); // closer -> larger
      return {
        sx: cx + x * rad * persp,
        sy: cyOrb + y * rad * persp,
        depth: (z + 1) / 2, // 0 far .. 1 near
        persp,
      };
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      t += 1;
      const { speaking: sp, thinking: th, online: on } = st.current;
      const target = (on ? 0.3 : 0.08) + (th ? 0.45 : 0) + (sp ? 0.7 : 0);
      energy += (target - energy) * 0.06;
      rot += 0.0024 + energy * 0.004;

      ctx.clearRect(0, 0, W, H);

      // soft core glow
      const halo = ctx.createRadialGradient(cx, cyOrb, 0, cx, cyOrb, R * 1.5);
      halo.addColorStop(0, `rgba(138,123,255,${0.10 + energy * 0.10})`);
      halo.addColorStop(0.5, `rgba(90,169,255,${0.05 + energy * 0.05})`);
      halo.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(cx - R * 1.5, cyOrb - R * 1.5, R * 3, R * 3);

      // speaking ripple amplitude (surface waveform)
      const speakAmp = sp ? 0.06 + Math.sin(t * 0.3) * 0.02 : 0;

      // ── orb particles ──
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        // breathing + speaking surface modulation by latitude
        const wob =
          1 +
          Math.sin(t * 0.03 + p.phase) * 0.012 +
          speakAmp * Math.sin(p.lat * 14 + t * 0.5) +
          (th ? Math.sin(t * 0.08 + p.phase) * 0.02 : 0);
        const pr = project(p, R * wob);
        const ci = Math.min(
          PALETTE.length - 1,
          Math.floor(p.lat * 3 + pr.depth * 2.5)
        );
        const size = (0.7 + pr.depth * 2.2) * pr.persp;
        ctx.globalAlpha = (on ? 0.35 + pr.depth * 0.6 : 0.2 + pr.depth * 0.3);
        const s = sprites[ci];
        ctx.drawImage(s, pr.sx - size, pr.sy - size, size * 2, size * 2);
      }

      // ── flowing rings ──
      for (let k = 0; k < rings.length; k++) {
        const ring = rings[k];
        const rr = R * (1.14 + Math.sin(t * 0.02 + k) * 0.02);
        for (let i = 0; i < ring.length; i++) {
          const pr = project(ring[i], rr);
          const size = (0.5 + pr.depth * 1.3) * pr.persp;
          ctx.globalAlpha = (on ? 0.18 + pr.depth * 0.4 : 0.12) * (0.6 + energy);
          ctx.drawImage(sprites[4], pr.sx - size, pr.sy - size, size * 2, size * 2);
        }
      }

      // ── bar line ──
      const grdW = R * 1.7;
      const lg = ctx.createLinearGradient(cx - grdW, 0, cx + grdW, 0);
      lg.addColorStop(0, "rgba(90,169,255,0)");
      lg.addColorStop(0.5, `rgba(63,134,247,${0.6 + energy * 0.25})`);
      lg.addColorStop(1, "rgba(138,123,255,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = lg;
      ctx.fillRect(cx - grdW, barY - 1.3, grdW * 2, 2.6);
      ctx.globalAlpha = 0.22 + energy * 0.15;
      ctx.fillRect(cx - grdW, barY - 5, grdW * 2, 10);

      // ── dust dissolving below the bar ──
      const boost = 1 + energy * 0.9;
      for (let i = 0; i < dust.length; i++) {
        const d = dust[i];
        d.life += boost;
        d.vy += 0.004;
        d.vx += Math.sin((d.y + t) * 0.02) * 0.01;
        d.x += d.vx;
        d.y += d.vy;
        const lt = d.life / d.maxLife;
        if (lt >= 1 || d.y > H + 8) {
          dust[i] = spawnDust(false);
          continue;
        }
        ctx.globalAlpha = Math.max(0, (on ? 0.7 : 0.35) * Math.sin(Math.min(1, lt) * Math.PI));
        const r = d.size * (1.2 - lt * 0.6) * 1.9;
        ctx.drawImage(dustSprites[d.sprite], d.x - r, d.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    };

    build();
    draw();
    const ro = new ResizeObserver(() => build());
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}
