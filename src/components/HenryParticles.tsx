import { useEffect, useRef } from "react";

interface Props {
  speaking: boolean;
  thinking: boolean;
  online: boolean;
  className?: string;
}

interface FaceParticle {
  x: number;
  y: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  size: number;
  sprite: number;
  phase: number; // for breathing / shimmer
  mouth: boolean; // belongs to the mouth band (animates while speaking)
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
  ox: number; // origin x along the bar
}

const COLORS = ["#5aa9ff", "#2e7bf6", "#8a7bff", "#2fd0a6"];
const DUST_COLORS = ["#9db9ff", "#b9a9ff", "#8fd9c4", "#a9c6ff"];

function makeSprite(color: string, dim = 36): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = dim;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(dim / 2, dim / 2, 0, dim / 2, dim / 2, dim / 2);
  grd.addColorStop(0, color);
  grd.addColorStop(0.35, color);
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(dim / 2, dim / 2, dim / 2, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** Draws an abstract human bust into an offscreen canvas and samples it
 *  into particle target points. The bust sits ABOVE the bar line. */
function sampleFace(w: number, h: number, barY: number) {
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const c = off.getContext("2d")!;
  c.clearRect(0, 0, w, h);
  c.fillStyle = "#fff";

  const cx = w / 2;
  const headR = Math.min(w, barY) * 0.27;
  const headCy = barY - headR * 1.9;

  // Shoulders / bust
  c.beginPath();
  c.moveTo(cx - headR * 2.4, barY);
  c.quadraticCurveTo(cx - headR * 1.7, headCy + headR * 1.1, cx - headR * 0.7, headCy + headR * 1.0);
  c.lineTo(cx + headR * 0.7, headCy + headR * 1.0);
  c.quadraticCurveTo(cx + headR * 1.7, headCy + headR * 1.1, cx + headR * 2.4, barY);
  c.closePath();
  c.fill();

  // Neck
  c.fillRect(cx - headR * 0.42, headCy + headR * 0.4, headR * 0.84, headR * 1.0);

  // Head
  c.beginPath();
  c.ellipse(cx, headCy, headR * 0.92, headR * 1.12, 0, 0, Math.PI * 2);
  c.fill();

  // sample
  const img = c.getImageData(0, 0, w, h).data;
  const pts: { x: number; y: number; mouth: boolean }[] = [];
  const step = Math.max(3, Math.round(Math.min(w, h) / 150));
  const mouthY = headCy + headR * 0.45;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const a = img[(y * w + x) * 4 + 3];
      if (a > 120) {
        const jx = x + (Math.random() - 0.5) * step;
        const jy = y + (Math.random() - 0.5) * step;
        const mouth =
          Math.abs(y - mouthY) < headR * 0.16 && Math.abs(x - cx) < headR * 0.45;
        pts.push({ x: jx, y: jy, mouth });
      }
    }
  }
  return { pts, headCy, headR, cx };
}

export default function HenryParticles({ speaking, thinking, online, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ speaking, thinking, online });
  stateRef.current = { speaking, thinking, online };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const sprites = COLORS.map((c) => makeSprite(c));
    const dustSprites = DUST_COLORS.map((c) => makeSprite(c, 24));

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let barY = 0;
    let face: FaceParticle[] = [];
    let dust: Dust[] = [];
    let raf = 0;
    let t = 0;

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, Math.floor(rect.width));
      H = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      barY = H * 0.66;
      const { pts } = sampleFace(W, H, barY);

      // Cap particles for performance.
      const CAP = 2600;
      const chosen = pts.length > CAP ? pts.sort(() => Math.random() - 0.5).slice(0, CAP) : pts;

      face = chosen.map((p) => ({
        x: W / 2 + (Math.random() - 0.5) * W,
        y: H / 2 + (Math.random() - 0.5) * H,
        tx: p.x,
        ty: p.y,
        vx: 0,
        vy: 0,
        size: 1.4 + Math.random() * 2.2,
        sprite: Math.random() < 0.08 ? 3 : Math.floor(Math.random() * 3),
        phase: Math.random() * Math.PI * 2,
        mouth: p.mouth,
      }));

      const DUST_CAP = 900;
      dust = Array.from({ length: DUST_CAP }, () => spawnDust(true));
    };

    function spawnDust(init = false): Dust {
      // emit along the bar, weighted to the bust centre
      const spread = W * 0.34;
      const ox = W / 2 + (Math.random() - 0.5) * 2 * spread;
      const maxLife = 70 + Math.random() * 120;
      return {
        x: ox + (Math.random() - 0.5) * 8,
        y: barY + (init ? Math.random() * (H - barY) : 0),
        vx: (Math.random() - 0.5) * 0.5,
        vy: 0.3 + Math.random() * 1.1,
        size: 0.6 + Math.random() * 1.8,
        life: init ? Math.random() * maxLife : 0,
        maxLife,
        sprite: Math.floor(Math.random() * dustSprites.length),
        ox,
      };
    }

    const draw = () => {
      raf = requestAnimationFrame(draw);
      t += 1;
      const { speaking: sp, thinking: th, online: on } = stateRef.current;
      ctx.clearRect(0, 0, W, H);

      const energy = (sp ? 1 : 0) * 1 + (th ? 0.6 : 0) + (on ? 0.25 : 0);
      const breathe = Math.sin(t * 0.02) * 2;
      const sway = Math.sin(t * 0.013) * (on ? 3 : 1);

      // ---- Face ----
      ctx.globalCompositeOperation = "source-over";
      for (let i = 0; i < face.length; i++) {
        const p = face[i];
        let tx = p.tx + sway;
        let ty = p.ty + breathe * 0.4;

        // mouth band animates while speaking
        if (p.mouth && sp) {
          ty += Math.sin(t * 0.5 + p.x * 0.05) * 4;
        }
        // thinking adds a soft turbulence across the whole face
        if (th) {
          tx += Math.sin(t * 0.08 + p.phase) * 2.4;
          ty += Math.cos(t * 0.07 + p.phase) * 2.4;
        }
        // idle shimmer
        const jitter = on ? 0.6 : 0.2;
        tx += Math.sin(t * 0.05 + p.phase) * jitter;

        const k = 0.06 + energy * 0.02;
        p.vx += (tx - p.x) * k;
        p.vy += (ty - p.y) * k;
        p.vx *= 0.78;
        p.vy *= 0.78;
        p.x += p.vx;
        p.y += p.vy;

        const pulse = 1 + Math.sin(t * 0.06 + p.phase) * 0.18 * (1 + energy);
        const r = p.size * pulse * 2.4;
        ctx.globalAlpha = on ? 0.85 : 0.45;
        const s = sprites[p.sprite];
        ctx.drawImage(s, p.x - r, p.y - r, r * 2, r * 2);
      }

      // ---- The bar line: where Henry is solid ----
      const grdW = W * 0.42;
      const lg = ctx.createLinearGradient(W / 2 - grdW, 0, W / 2 + grdW, 0);
      lg.addColorStop(0, "rgba(90,169,255,0)");
      lg.addColorStop(0.5, `rgba(46,123,246,${0.55 + energy * 0.2})`);
      lg.addColorStop(1, "rgba(138,123,255,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = lg;
      ctx.fillRect(W / 2 - grdW, barY - 1.2, grdW * 2, 2.4);
      // soft glow under the bar
      ctx.globalAlpha = 0.25 + energy * 0.15;
      ctx.fillRect(W / 2 - grdW, barY - 4, grdW * 2, 8);

      // ---- Dust: fades down from the bar ----
      ctx.globalCompositeOperation = "source-over";
      const emitBoost = 1 + energy * 0.8;
      for (let i = 0; i < dust.length; i++) {
        const d = dust[i];
        d.life += 1 * emitBoost;
        d.vy += 0.004; // gentle gravity
        d.vx += Math.sin((d.y + t) * 0.02) * 0.01; // drift
        d.x += d.vx + sway * 0.04;
        d.y += d.vy;

        const lifeT = d.life / d.maxLife;
        if (lifeT >= 1 || d.y > H + 10) {
          dust[i] = spawnDust(false);
          continue;
        }
        // fade in quickly near the bar, then fade out as it falls
        const alpha = (on ? 0.7 : 0.35) * Math.sin(Math.min(1, lifeT) * Math.PI);
        const r = d.size * (1.2 - lifeT * 0.6) * 2.0;
        ctx.globalAlpha = Math.max(0, alpha);
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
