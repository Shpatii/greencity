'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { loadData, type SegmentFeature } from '@/lib/loadData';
import type { Meta, Weights } from '@/lib/types';
import { rescore } from '@/lib/score';
import { sameWeights } from '@/lib/weights';
import { copy } from '@/content/copy';
import RankList from '@/components/RankList';
import SegmentCard from '@/components/SegmentCard';
import WeightSliders from '@/components/WeightSliders';
import MethodBox from '@/components/MethodBox';
import Legend from '@/components/Legend';

// maplibre-gl touches window, so keep it out of the server render.
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function Page() {
  const [segments, setSegments] = useState<SegmentFeature[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [weights, setWeights] = useState<Weights | null>(null);

  useEffect(() => {
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
    <main className="flex min-h-screen flex-col md:h-screen md:flex-row">
      <section className="relative h-[60vh] w-full shrink-0 md:h-full md:w-[65%]">
        {meta ? (
          <MapView segments={mapSegments} meta={meta} selectedId={selectedId} setSelectedId={setSelectedId} />
        ) : (
          <div className="flex h-full items-center justify-center bg-neutral-100 text-sm text-neutral-600">
            {error ? copy.loadError : copy.loading}
          </div>
        )}
      </section>

      <aside className="flex w-full flex-col border-t border-neutral-200 md:h-full md:w-[35%] md:overflow-y-auto md:border-l md:border-t-0">
        <header className="border-b border-neutral-200 px-4 py-3">
          <h1 className="text-xl font-semibold">{copy.appTitle}</h1>
          <p className="mt-0.5 text-sm text-neutral-600">{copy.tagline}</p>
        </header>

        {meta && weights && (
          <div className="flex flex-col gap-3 p-4">
            <Legend />
            <RankList segments={scored} selectedId={selectedId} setSelectedId={setSelectedId} />
            {selectedSegment ? (
              <SegmentCard segment={selectedSegment} meta={meta} weights={weights} onClose={() => setSelectedId(null)} />
            ) : (
              <p className="rounded border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">
                {copy.emptyStates.noSegmentSelected}
              </p>
            )}
            <WeightSliders weights={weights} defaults={meta.default_weights} onChange={setWeights} />
            <MethodBox weights={weights} meta={meta} />
          </div>
        )}
      </aside>
    </main>
  );
}
