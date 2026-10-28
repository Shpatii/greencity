'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { loadCounters, loadData, type CounterCollection, type SegmentFeature } from '@/lib/loadData';
import type { Meta, Weights } from '@/lib/types';
import { rankSegments, type RankedSegment } from '@/lib/score';
import { exportTopN } from '@/lib/exportCsv';
import { formatDataDate } from '@/lib/format';
import { copy } from '@/content/copy';
import SiteNav from '@/components/SiteNav';
import RankList from '@/components/RankList';
import SegmentCard from '@/components/SegmentCard';
import WeightSliders from '@/components/WeightSliders';
import MethodBox from '@/components/MethodBox';
import Legend from '@/components/Legend';
import LegalLinks from '@/components/LegalLinks';

// maplibre-gl touches window, so keep it out of the server render.
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

const DEBOUNCE_MS = 150;
const RANK_CHANGED_MS = 2000;

/** The feature with live score and rank for the current weights. */
function withLive(f: SegmentFeature, r: RankedSegment | undefined): SegmentFeature {
  return r ? { ...f, properties: { ...f.properties, score: r.score, rank: r.rank } } : f;
}

export default function MapPage() {
  const [segments, setSegments] = useState<SegmentFeature[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Sliders show `weights` at once; scoring follows `appliedWeights` 150 ms later.
  const [weights, setWeights] = useState<Weights | null>(null);
  const [appliedWeights, setAppliedWeights] = useState<Weights | null>(null);
  const [rankChanged, setRankChanged] = useState(false);
  const [gapsOnly, setGapsOnly] = useState(false);
  const [counters, setCounters] = useState<CounterCollection | null>(null);
  const [showCounters, setShowCounters] = useState(false);
  const recomputeMsRef = useRef(0);
  // From md up the panel and legend float over the map; keep the streets out from under them.
  const [desktop, setDesktop] = useState(false);
  const inset = useMemo(() => desktop
    ? { top: 60, right: 444, bottom: 16, left: 16 }
    : undefined, [desktop]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    // Landing page links here with ?id=seg_… to open one street.
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) setSelectedId(id);
    loadData()
      .then(({ segments, meta }) => {
        setSegments(segments.features);
        setMeta(meta);
        setWeights(meta.default_weights);
        setAppliedWeights(meta.default_weights);
      })
      .catch((e: unknown) => {
        console.error(e);
        setError(true);
      });
    loadCounters().then(setCounters);
  }, []);

  useEffect(() => {
    if (weights === appliedWeights) return;
    const t = setTimeout(() => setAppliedWeights(weights), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [weights, appliedWeights]);

  // Re-score in the browser with score.ts (same formula as the pipeline).
  const ranking = useMemo(() => {
    if (!meta || !appliedWeights) return [];
    const t0 = performance.now();
    const r = rankSegments(segments, appliedWeights, meta);
    recomputeMsRef.current = performance.now() - t0;
    return r;
  }, [segments, meta, appliedWeights]);
  const rankById = useMemo(() => new Map(ranking.map((r) => [r.id, r])), [ranking]);
  const featureById = useMemo(() => new Map(segments.map((f) => [f.properties.id, f])), [segments]);

  // Contract 3.2b fields are optional: no infra_gap in the data -> no gap toggle.
  const hasGapField = useMemo(() => segments.some((f) => f.properties.infra_gap !== undefined), [segments]);
  const gapFilter = gapsOnly && hasGapField;

  // rankSegments lists ranked segments first, best first; the gap filter keeps their rank numbers.
  const top10 = useMemo(
    () =>
      ranking
        .filter((r) => r.rank !== null && (!gapFilter || featureById.get(r.id)!.properties.infra_gap))
        .slice(0, 10)
        .map((r) => withLive(featureById.get(r.id)!, r)),
    [ranking, featureById, gapFilter],
  );
  const selected = selectedId ? featureById.get(selectedId) : undefined;
  const selectedSegment = selected ? withLive(selected, rankById.get(selected.properties.id)) : null;

  // Flash "Ranking changed" when the #1 street changes (not on first load, not when filtering).
  const topId = ranking[0]?.rank != null ? ranking[0].id : null;
  const prevTopIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevTopIdRef.current;
    prevTopIdRef.current = topId;
    if (prev === null || topId === null || prev === topId) return;
    setRankChanged(true);
    const t = setTimeout(() => setRankChanged(false), RANK_CHANGED_MS);
    return () => clearTimeout(t);
  }, [topId]);

  const logTiming = useCallback(
    (stateMs: number, paintMs: number) => {
      const ms = (n: number) => n.toFixed(1);
      console.info(
        `[weights] ${segments.length} segments: rankSegments ${ms(recomputeMsRef.current)} ms, ` +
          `setFeatureState ${ms(stateMs)} ms, recolour to next frame ${ms(paintMs)} ms, ` +
          `total ${ms(recomputeMsRef.current + paintMs)} ms`,
      );
    },
    [segments.length],
  );

  const panel = 'rounded-2xl bg-white/[0.04] p-4 ring-1 ring-inset ring-white/[0.08]';
  const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-neutral-100 md:h-screen md:overflow-hidden">
      <SiteNav overlay />
      <main className="md:relative md:h-full">
        <section className="map-shell relative mt-12 h-[62vh] w-full md:absolute md:inset-0 md:mt-0 md:h-full">
          {meta ? (
            <MapView
              segments={segments}
              ranking={ranking}
              onRecoloured={logTiming}
              dimNonGaps={gapFilter}
              counters={counters}
              showCounters={showCounters}
              meta={meta}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              inset={inset}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400">
              {error ? copy.loadError : copy.loading}
            </div>
          )}
          {meta && (
            <div className="pointer-events-auto absolute bottom-4 left-4 z-10 hidden w-[360px] rounded-2xl bg-black/60 p-4 shadow-2xl ring-1 ring-inset ring-white/10 backdrop-blur-xl md:block">
              <Legend />
            </div>
          )}
        </section>

        <aside className="flex w-full flex-col md:absolute md:bottom-3 md:right-3 md:top-[60px] md:z-10 md:w-[420px] md:overflow-y-auto md:rounded-3xl md:bg-black/60 md:shadow-2xl md:ring-1 md:ring-inset md:ring-white/10 md:backdrop-blur-2xl md:backdrop-saturate-150 [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]">
          <header className="px-5 pb-1 pt-6">
            <p className="text-xs font-medium tracking-wide text-amber-300">{copy.landing.eyebrow}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">{copy.legend.title}</h1>
            <p className="mt-1.5 text-sm leading-snug text-neutral-400">{copy.tagline}</p>
            {meta && (
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
                <span>
                  <span className="font-semibold tabular-nums text-white">{fmt(meta.n_segments)}</span> {copy.mapStats.segments}
                </span>
                <span>
                  <span className="font-semibold tabular-nums text-white">{fmt(meta.n_eligible)}</span> {copy.mapStats.scored}
                </span>
              </p>
            )}
            {meta && <p className="mt-2 text-xs text-neutral-500">{copy.dataAsOf(formatDataDate(meta.generated_at))}</p>}
          </header>

          {meta && weights && (
            <div className="flex flex-col gap-3 p-4 pt-3">
              <div className={`${panel} md:hidden`}>
                <Legend />
              </div>
              {selectedSegment && (
                <SegmentCard segment={selectedSegment} meta={meta} weights={appliedWeights ?? weights} onClose={() => setSelectedId(null)} />
              )}
              {(hasGapField || counters) && (
                <fieldset className={panel}>
                  <legend className="sr-only">{copy.layers.title}</legend>
                  <p aria-hidden="true" className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">{copy.layers.title}</p>
                  {hasGapField && (
                    <Toggle checked={gapsOnly} onChange={setGapsOnly} label={copy.layers.gapsOnly} hint={copy.layers.gapsHint} />
                  )}
                  {counters && (
                    <div className={hasGapField ? 'mt-3' : ''}>
                      <Toggle checked={showCounters} onChange={setShowCounters} label={copy.layers.counters} />
                    </div>
                  )}
                </fieldset>
              )}
              <RankList
                segments={top10}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                changed={rankChanged}
                emptyText={gapFilter ? copy.rankList.noGaps : undefined}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
                <button
                  type="button"
                  onClick={() => exportTopN(segments, weights, meta)}
                  className="rounded-full bg-white px-3.5 py-1.5 font-medium text-black transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                >
                  {copy.downloads.csv}
                </button>
                <a
                  href="/report.pdf"
                  target="_blank"
                  rel="noopener"
                  title={copy.downloads.pdfHint}
                  className="rounded font-medium text-amber-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                >
                  {copy.downloads.pdf}
                </a>
              </div>
              {!selectedSegment && (
                <p className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-neutral-400">
                  {copy.emptyStates.noSegmentSelected}
                </p>
              )}
              <WeightSliders weights={weights} defaults={meta.default_weights} onChange={setWeights} />
              <MethodBox weights={weights} meta={meta} showCountersSource={!!counters && showCounters} />
              <LegalLinks className="px-1 text-xs text-neutral-500" />
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

/** Switch-style checkbox for the map layer options. */
function Toggle({ checked, onChange, label, hint }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 text-sm text-neutral-100">
      <span>
        {label}
        {hint && <span className="mt-0.5 block text-xs leading-snug text-neutral-400">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-white/15 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-amber-400 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-amber-300 motion-reduce:transition-none motion-reduce:after:transition-none"
      />
    </label>
  );
}
