'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { loadCounters, loadData, type CounterCollection, type SegmentFeature } from '@/lib/loadData';
import type { Meta, Weights } from '@/lib/types';
import { rankSegments, type RankedSegment } from '@/lib/score';
import { exportTopN } from '@/lib/exportCsv';
import { copy } from '@/content/copy';
import SiteNav from '@/components/SiteNav';
import RankList from '@/components/RankList';
import SegmentCard from '@/components/SegmentCard';
import WeightSliders from '@/components/WeightSliders';
import MethodBox from '@/components/MethodBox';
import Legend from '@/components/Legend';

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

  return (
    <div className="flex min-h-screen flex-col md:h-screen">
      <SiteNav />
      <main className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        <section className="relative h-[60vh] w-full shrink-0 md:h-full md:flex-1">
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
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-neutral-100 text-sm text-neutral-600">
              {error ? copy.loadError : copy.loading}
            </div>
          )}
        </section>

        <aside className="flex w-full flex-col bg-[#f5f5f7] md:h-full md:w-[440px] md:shrink-0 md:overflow-y-auto">
          <header className="px-5 pb-2 pt-6">
            <h1 className="text-2xl font-semibold tracking-tight">{copy.legend.title}</h1>
            <p className="mt-1 text-sm text-neutral-600">{copy.tagline}</p>
          </header>

          {meta && weights && (
            <div className="flex flex-col gap-4 p-5 pt-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <Legend />
              </div>
              {selectedSegment && (
                <SegmentCard segment={selectedSegment} meta={meta} weights={appliedWeights ?? weights} onClose={() => setSelectedId(null)} />
              )}
              {(hasGapField || counters) && (
                <fieldset className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <legend className="sr-only">{copy.layers.title}</legend>
                  <p aria-hidden="true" className="mb-2 text-sm font-semibold text-neutral-900">{copy.layers.title}</p>
                  {hasGapField && (
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-neutral-800">
                      <input
                        type="checkbox"
                        checked={gapsOnly}
                        onChange={(e) => setGapsOnly(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-blue-700"
                      />
                      <span>
                        {copy.layers.gapsOnly}
                        <span className="block text-xs text-neutral-600">{copy.layers.gapsHint}</span>
                      </span>
                    </label>
                  )}
                  {counters && (
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-neutral-800">
                      <input
                        type="checkbox"
                        checked={showCounters}
                        onChange={(e) => setShowCounters(e.target.checked)}
                        className="h-4 w-4 accent-blue-700"
                      />
                      {copy.layers.counters}
                    </label>
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
              <div className="-mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
                <button
                  type="button"
                  onClick={() => exportTopN(segments, weights, meta)}
                  className="rounded-full bg-white px-3 py-1.5 font-medium text-blue-800 shadow-sm ring-1 ring-inset ring-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                >
                  {copy.downloads.csv}
                </button>
                <a
                  href="/report.pdf"
                  target="_blank"
                  rel="noopener"
                  title={copy.downloads.pdfHint}
                  className="rounded font-medium text-blue-800 underline underline-offset-2 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                >
                  {copy.downloads.pdf}
                </a>
              </div>
              {!selectedSegment && (
                <p className="rounded-2xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">
                  {copy.emptyStates.noSegmentSelected}
                </p>
              )}
              <WeightSliders weights={weights} defaults={meta.default_weights} onChange={setWeights} />
              <MethodBox weights={weights} meta={meta} showCountersSource={!!counters && showCounters} />
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
