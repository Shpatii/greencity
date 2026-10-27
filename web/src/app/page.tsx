'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadData, type SegmentFeature } from '@/lib/loadData';
import type { FactorKey, Meta } from '@/lib/types';
import { cityStats, topReasons, topSegments } from '@/lib/stats';
import { copy } from '@/content/copy';
import { colorForScore } from '@/content/theme';
import SiteNav from '@/components/SiteNav';
import HeroNetwork from '@/components/landing/HeroNetwork';
import Reveal from '@/components/landing/Reveal';

const FACTORS: FactorKey[] = ['safety', 'danger', 'surface', 'air', 'flow'];
const fmt = new Intl.NumberFormat('en-US');
const t = copy.landing;

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Europe/Berlin' }).format(date);
}

export default function Landing() {
  const [segments, setSegments] = useState<SegmentFeature[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    loadData()
      .then(({ segments, meta }) => {
        setSegments(segments.features);
        setMeta(meta);
      })
      .catch((e: unknown) => console.error(e));
  }, []);

  const stats = cityStats(segments);
  const top = topSegments(segments, 3);
  const ready = meta !== null;

  return (
    <div className="bg-black text-white">
      <SiteNav overlay />

      {/* Hero */}
      <section className="relative flex min-h-[100svh] flex-col items-center overflow-hidden pt-28 text-center">
        {meta && <HeroNetwork segments={segments} meta={meta} />}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,0,0,0.92)_25%,rgba(0,0,0,0.2)_60%,rgba(0,0,0,0.85)_100%)]"
        />
        <div className="relative z-10 max-w-3xl px-6">
          <p className="animate-fade-up text-sm font-medium tracking-wide text-amber-300 [animation-delay:100ms]">
            {t.eyebrow}
          </p>
          <h1 className="mt-4 animate-fade-up text-[2.6rem] font-semibold leading-[1.05] tracking-tight [animation-delay:200ms] sm:text-7xl">
            {t.headline[0]}
            <br />
            <span className="bg-gradient-to-r from-amber-200 via-orange-400 to-rose-500 bg-clip-text text-transparent">
              {t.headline[1]}
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl animate-fade-up text-lg leading-relaxed text-neutral-300 [animation-delay:350ms] sm:text-xl">
            {t.intro}
          </p>
          <div className="mt-8 flex animate-fade-up flex-wrap items-center justify-center gap-x-8 gap-y-4 [animation-delay:500ms]">
            <Link
              href="/map"
              className="rounded-full bg-[#0071e3] px-6 py-3 text-base font-medium text-white transition-colors hover:bg-[#0077ed]"
            >
              {t.ctaPrimary}
            </Link>
            <a href="#signals" className="text-base text-[#2997ff] hover:underline">
              {t.ctaSecondary} ›
            </a>
          </div>
        </div>
        <p className="absolute bottom-6 z-10 mx-6 rounded-full bg-black/70 px-4 py-1.5 text-xs text-neutral-400 backdrop-blur">
          {t.heroCaption}
        </p>
      </section>

      {/* Stats */}
      <section className="bg-[#f5f5f7] px-6 py-28 text-neutral-900 sm:py-36">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-4xl font-semibold tracking-tight sm:text-6xl">{t.statsTitle}</h2>
          </Reveal>
          <Reveal delay={150} className="mt-16 text-center">
            <p className="bg-gradient-to-br from-orange-500 to-rose-600 bg-clip-text text-8xl font-semibold tracking-tighter text-transparent sm:text-[10rem] sm:leading-none">
              {ready && stats.closeShare !== null ? `${Math.round(stats.closeShare * 100)}%` : '–'}
            </p>
            <p className="mx-auto mt-4 max-w-md text-xl text-neutral-600 sm:text-2xl">{t.stats.closeShare}</p>
          </Reveal>
          <div className="mt-20 grid gap-4 sm:grid-cols-3">
            {[
              { value: stats.overtakes, label: t.stats.overtakes },
              { value: stats.measured, label: t.stats.measured },
              { value: stats.ranked, label: t.stats.ranked },
            ].map(({ value, label }, i) => (
              <Reveal key={label} delay={i * 120}>
                <div className="h-full rounded-3xl bg-white p-8 shadow-sm">
                  <p className="text-5xl font-semibold tracking-tight tabular-nums">{ready ? fmt.format(value) : '–'}</p>
                  <p className="mt-2 text-neutral-600">{label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Signals */}
      <section id="signals" className="scroll-mt-12 px-6 py-28 sm:py-36">
        <div className="mx-auto max-w-5xl">
          <Reveal className="text-center">
            <h2 className="text-4xl font-semibold tracking-tight sm:text-6xl">{t.signalsTitle}</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-neutral-400 sm:text-xl">{t.signalsIntro}</p>
          </Reveal>
          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {FACTORS.map((key, i) => (
              <Reveal key={key} delay={i * 100}>
                <div className="flex h-full flex-col rounded-3xl bg-neutral-900 p-6 ring-1 ring-white/10">
                  <p className="text-4xl font-semibold tracking-tight text-white tabular-nums">
                    {meta ? `${Math.round(meta.default_weights[key] * 100)}%` : '–'}
                  </p>
                  <p className="text-xs uppercase tracking-wider text-neutral-500">{t.weightLabel}</p>
                  <h3 className="mt-6 text-lg font-semibold">{copy.factorLabels[key]}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-400">{copy.factorTooltips[key]}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Top 3 */}
      <section className="bg-white px-6 py-28 text-neutral-900 sm:py-36">
        <div className="mx-auto max-w-5xl">
          <Reveal className="text-center">
            <h2 className="text-4xl font-semibold tracking-tight sm:text-6xl">{t.topTitle}</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-neutral-600 sm:text-xl">{t.topIntro}</p>
          </Reveal>
          <div className="mt-16 grid gap-4 md:grid-cols-3">
            {top.map(({ properties: p }, i) => {
              const reason = meta ? topReasons(p, meta.default_weights, 1)[0] : undefined;
              return (
                <Reveal key={p.id} delay={i * 120}>
                  <Link
                    href={`/map?id=${p.id}`}
                    className="group flex h-full flex-col rounded-3xl bg-[#f5f5f7] p-8 transition-transform duration-300 hover:scale-[1.02]"
                  >
                    <p className="text-sm font-medium text-neutral-500">{t.rankLabel(p.rank ?? i + 1)}</p>
                    <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">{p.name ?? copy.unnamed}</h3>
                    <div className="mt-8 flex items-baseline gap-3">
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 rounded-full ring-1 ring-inset ring-black/30"
                        style={{ backgroundColor: colorForScore(p.score) }}
                      />
                      <span className="text-6xl font-semibold tracking-tighter tabular-nums">{p.score?.toFixed(1)}</span>
                      <span className="text-sm text-neutral-500">/ 100</span>
                    </div>
                    {reason && <p className="mt-6 flex-1 leading-relaxed text-neutral-700">{reason.text}</p>}
                    <p className="mt-6 text-[#0066cc] group-hover:underline">{t.seeOnMap} ›</p>
                  </Link>
                </Reveal>
              );
            })}
          </div>
          <Reveal className="mt-12 text-center">
            <Link href="/map" className="text-lg text-[#0066cc] hover:underline">
              {t.seeAll} ›
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Limits */}
      <section className="bg-[#f5f5f7] px-6 py-24 text-neutral-900">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.methodBox.limitsTitle}</h2>
          </Reveal>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {copy.methodBox.limits.map((limit, i) => (
              <Reveal key={limit} delay={i * 100}>
                <p className="border-t border-neutral-300 pt-4 leading-relaxed text-neutral-600">{limit}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden px-6 py-32 text-center sm:py-44">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-amber-400/30 via-orange-500/20 to-rose-600/30 blur-3xl"
        />
        <Reveal className="relative">
          <h2 className="text-5xl font-semibold tracking-tight sm:text-7xl">{t.finalTitle}</h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-400 sm:text-xl">{t.finalIntro}</p>
          <Link
            href="/map"
            className="mt-10 inline-block rounded-full bg-white px-7 py-3 text-base font-medium text-black transition-colors hover:bg-neutral-200"
          >
            {t.ctaPrimary}
          </Link>
        </Reveal>
      </section>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-neutral-500">
        {meta && <p>{copy.methodBox.dataSource(formatDate(meta.generated_at))}</p>}
        {meta?.source === 'mock' && <p className="mt-1 text-red-400">{copy.methodBox.mockWarning}</p>}
      </footer>
    </div>
  );
}
