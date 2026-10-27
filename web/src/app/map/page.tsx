'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { loadData, type SegmentFeature } from '@/lib/loadData';
import type { Meta, Weights } from '@/lib/types';
import { rescore } from '@/lib/score';
import { sameWeights } from '@/lib/weights';
import { copy } from '@/content/copy';
import SiteNav from '@/components/SiteNav';
import RankList from '@/components/RankList';
import SegmentCard from '@/components/SegmentCard';
import WeightSliders from '@/components/WeightSliders';
import MethodBox from '@/components/MethodBox';
import Legend from '@/components/Legend';

// maplibre-gl touches window, so keep it out of the server render.
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function MapPage() {
  const [segments, setSegments] = useState<SegmentFeature[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [weights, setWeights] = useState<Weights | null>(null);

  useEffect(() => {
    // Landing page links here with ?id=seg_… to open one street.
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) setSelectedId(id);
    loadData()
      .then(({ segments, meta }) => {
        setSegments(segments.features);
        setMeta(meta);
        setWeights(meta.default_weights);
      })
      .catch((e: unknown) => {
        console.error(e);
        setError(true);
      });
  }, []);

  // Default weights keep the published scores; other weights re-score in the browser (score.ts).
  const scored = useMemo(
    () => (meta && weights && !sameWeights(weights, meta.default_weights) ? rescore(segments, weights, meta) : segments),
    [segments, meta, weights],
  );
  // The map re-uploads all features on change; let the sliders stay responsive.
  const mapSegments = useDeferredValue(scored);
  const selectedSegment = scored.find((f) => f.properties.id === selectedId) ?? null;

  return (
    <div className="flex min-h-screen flex-col md:h-screen">
      <SiteNav />
      <main className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        <section className="relative h-[60vh] w-full shrink-0 md:h-full md:flex-1">
          {meta ? (
            <MapView segments={mapSegments} meta={meta} selectedId={selectedId} setSelectedId={setSelectedId} />
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
                <SegmentCard segment={selectedSegment} meta={meta} weights={weights} onClose={() => setSelectedId(null)} />
              )}
              <RankList segments={scored} selectedId={selectedId} setSelectedId={setSelectedId} />
              {!selectedSegment && (
                <p className="rounded-2xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">
                  {copy.emptyStates.noSegmentSelected}
                </p>
              )}
              <WeightSliders weights={weights} defaults={meta.default_weights} onChange={setWeights} />
              <MethodBox weights={weights} meta={meta} />
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
