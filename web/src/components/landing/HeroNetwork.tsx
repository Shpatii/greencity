'use client';

import { useEffect, useRef } from 'react';
import type { SegmentFeature } from '@/lib/loadData';
import type { Meta } from '@/lib/types';
import { scoreBreaks } from '@/content/theme';

// The map's ramp ends in dark purple, which vanishes on black. The hero uses its own
// ramp instead: quiet grey for low priority, warm and bright for high.
const HERO_COLORS = ['rgba(255,255,255,0.22)', '#ffd60a', '#ff9f0a', '#ff453a', '#ff2d55'];
const NO_DATA = 'rgba(255,255,255,0.08)';
const DRAW_MS = 2200;

interface Line {
  coords: number[][];
  color: string;
  glow: boolean;
  /** Distance from the city centre; lines are drawn outward from it. */
  d: number;
}

function heroColor(score: number | null): string {
  if (score === null) return NO_DATA;
  return HERO_COLORS[scoreBreaks.filter((b) => score >= b).length];
}

// The real street network, drawn outward from the city centre on a canvas.
export default function HeroNetwork({ segments, meta }: { segments: SegmentFeature[]; meta: Meta }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const [minX, minY, maxX, maxY] = meta.bbox;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const kx = Math.cos((cy * Math.PI) / 180); // degrees of longitude are shorter here
    const lines: Line[] = segments
      .map(({ geometry, properties: p }) => {
        const [x, y] = geometry.coordinates[0];
        return {
          coords: geometry.coordinates,
          color: heroColor(p.score),
          glow: p.score !== null && p.score >= scoreBreaks[0],
          d: Math.hypot((x - cx) * kx, y - cy),
        };
      })
      .sort((a, b) => a.d - b.d);

    let scale = 1;
    let ox = 0;
    let oy = 0;
    const setup = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      scale = Math.min(w / ((maxX - minX) * kx), h / (maxY - minY)) * 1.15;
      ox = w / 2;
      oy = h * 0.58;
    };
    const draw = (from: number, to: number) => {
      for (let i = from; i < to; i++) {
        const line = lines[i];
        ctx.beginPath();
        line.coords.forEach(([x, y], j) => {
          const px = ox + (x - cx) * kx * scale;
          const py = oy - (y - cy) * scale;
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = line.color;
        if (line.glow) {
          ctx.globalAlpha = 0.18;
          ctx.lineWidth = 5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.lineWidth = line.glow ? 1.4 : 1;
        ctx.stroke();
      }
    };

    let frame = 0;
    const drawAll = () => {
      cancelAnimationFrame(frame);
      setup();
      draw(0, lines.length);
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      drawAll();
    } else {
      setup();
      let start = 0;
      let done = 0;
      const step = (t: number) => {
        if (!start) start = t;
        const progress = Math.min(1, (t - start) / DRAW_MS);
        const eased = 1 - Math.pow(1 - progress, 3);
        const target = Math.round(eased * lines.length);
        draw(done, target);
        done = target;
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }

    window.addEventListener('resize', drawAll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', drawAll);
    };
  }, [segments, meta]);

  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}
