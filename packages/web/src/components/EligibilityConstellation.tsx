"use client";

import { useEffect, useRef } from "react";

/* Eligibility constellation.
   A slow field of drifting nodes joined by hairline links. Links appear and
   release as nodes pass close to each other, so the backdrop reads as a live
   scheme-matching graph rather than generic noise.

   Two node kinds:
   - "hub" nodes : emerald, larger, with a soft glow and a breathing ring.
                   These stand in for schemes.
   - plain nodes : dim white dots standing in for eligibility criteria.

   Keep the live count low: the graph sits behind backdrop-blur panels, so
   few + large + slow stays crisp where small + fast turns to mush.

   Canvas 2D is the right tool here -- drawing N*(N-1)/2 links in the DOM would
   mean thousands of elements. The loop pauses when the tab is hidden and never
   starts at all under prefers-reduced-motion (one static frame instead). */

type GraphNode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  phase: number;
  speed: number;
  hub: boolean;
};

const EMERALD = "16, 185, 129"; // #10B981
const WHITE = "255, 255, 255";

const LINK_DISTANCE = 180; // px -- links only form inside this radius
const LINK2 = LINK_DISTANCE * LINK_DISTANCE;
const WRAP_PAD = 30; // px of off-screen slack before a node wraps around
const DENSITY = 16000; // one node per this many square px
const MIN_NODES = 30;
const MAX_NODES = 96;

export function EligibilityConstellation({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const found = canvasRef.current;
    if (!found) return;
    const foundCtx = found.getContext("2d");
    if (!foundCtx) return;

    // Re-bind with non-null types so the closures below stay type-safe.
    const canvas: HTMLCanvasElement = found;
    const ctx: CanvasRenderingContext2D = foundCtx;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let nodes: GraphNode[] = [];
    let frame = 0;
    let startedAt = 0;
    let resizeTimer = 0;

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    function seed() {
      const count = Math.max(MIN_NODES, Math.min(MAX_NODES, Math.round((w * h) / DENSITY)));
      nodes = [];
      for (let i = 0; i < count; i++) {
        const hub = i % 5 === 0; // every 5th node is a scheme hub
        nodes.push({
          x: rand(0, w),
          y: rand(0, h),
          vx: rand(0.05, 0.17) * (Math.random() < 0.5 ? -1 : 1),
          vy: rand(0.05, 0.17) * (Math.random() < 0.5 ? -1 : 1),
          r: hub ? rand(2.2, 3.2) : rand(1.0, 1.9),
          alpha: hub ? rand(0.6, 0.85) : rand(0.28, 0.52),
          phase: Math.random() * Math.PI * 2,
          speed: rand(0.5, 1.1),
          hub,
        });
      }
    }

    function resize() {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const cssW = Math.max(1, Math.floor(rect.width));
      const cssH = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      w = cssW;
      h = cssH;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function visible(n: GraphNode) {
      return n.x > -6 && n.x < w + 6 && n.y > -6 && n.y < h + 6;
    }

    function draw(elapsedMs: number, advance: boolean) {
      ctx.clearRect(0, 0, w, h);

      const pad = WRAP_PAD;
      if (advance) {
        for (const n of nodes) {
          n.x += n.vx;
          n.y += n.vy;
          // Wrap through a narrow off-screen band. Links are only drawn when
          // both endpoints are on-screen, so a node re-entering from the far
          // edge can never streak a line across the viewport.
          if (n.x < -pad) n.x += w + pad * 2;
          else if (n.x > w + pad) n.x -= w + pad * 2;
          if (n.y < -pad) n.y += h + pad * 2;
          else if (n.y > h + pad) n.y -= h + pad * 2;
        }
      }

      // Links first, so the nodes sit on top of them.
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        if (!visible(a)) continue;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          if (!visible(b)) continue;

          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK2) continue;

          const fade = 1 - Math.sqrt(d2) / LINK_DISTANCE;
          const strength = a.hub || b.hub ? 0.42 : 0.22;
          ctx.strokeStyle = `rgba(${EMERALD}, ${(fade * strength).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      const seconds = elapsedMs / 1000;
      for (const n of nodes) {
        if (!visible(n)) continue;

        const pulse = advance ? 0.5 + 0.5 * Math.sin(seconds * n.speed + n.phase) : 0.7;
        const alpha = n.alpha * (0.72 + 0.28 * pulse);

        if (n.hub) {
          const glowR = n.r * 12;
          const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
          glow.addColorStop(0, `rgba(${EMERALD}, ${(alpha * 0.5).toFixed(3)})`);
          glow.addColorStop(1, `rgba(${EMERALD}, 0)`);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = `rgba(${n.hub ? EMERALD : WHITE}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();

        if (n.hub) {
          ctx.lineWidth = 1;
          ctx.strokeStyle = `rgba(${EMERALD}, ${(alpha * 0.5).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 4 + pulse * 3.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    function loop(now: number) {
      if (!startedAt) startedAt = now;
      draw(now - startedAt, true);
      frame = window.requestAnimationFrame(loop);
    }

    function stop() {
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
    }

    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resize();
        if (reduceMotion) draw(0, false);
      }, 120);
    };

    const onVisibility = () => {
      if (reduceMotion) return;
      if (document.hidden) stop();
      else if (!frame) frame = window.requestAnimationFrame(loop);
    };

    resize();
    if (reduceMotion) {
      draw(0, false); // static constellation, no animation loop at all
    } else if (!document.hidden) {
      // Don't burn frames if we mounted into a background tab; the
      // visibilitychange handler starts the loop once it comes forward.
      frame = window.requestAnimationFrame(loop);
    }

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      nodes = [];
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 block h-full w-full ${className}`}
    />
  );
}
