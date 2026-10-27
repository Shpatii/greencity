'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { loadData, type SegmentFeature } from '@/lib/loadData';
import type { Meta } from '@/lib/types';
import { copy } from '@/content/copy';
import SiteNav from '@/components/SiteNav';
import RankList from '@/components/RankList';
import SegmentCard from '@/components/SegmentCard';
import MethodBox from '@/components/MethodBox';
import Legend from '@/components/Legend';

// maplibre-gl touches window, so keep it out of the server render.
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function MapPage() {
  const [segments, setSegments] = useState<SegmentFeature[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    // Landing page links here with ?id=seg_… to open one street.
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) setSelectedId(id);
    loadData()
      .then(({ segments, meta }) => {
        setSegments(segments.features);
        setMeta(meta);
      })
      .catch((e: unknown) => {
        console.error(e);
        setError(true);
      });
  }, []);

  const selectedSegment = segments.find((f) => f.properties.id === selectedId) ?? null;

  return (
    <div className="flex min-h-screen flex-col md:h-screen">
      <SiteNav />
      <main className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        <section className="relative h-[60vh] w-full shrink-0 md:h-full md:flex-1">
          {meta ? (
            <MapView segments={segments} meta={meta} selectedId={selectedId} setSelectedId={setSelectedId} />
          ) : (
            <div className="flex h-full items-center justify-center bg-neutral-100 text-sm text-neutral-600">
              {error ? copy.loadError : copy.loading}
            </div>
          )}
        </section>

        <aside className="flex w-full flex-col bg-[#f5f5f7] md:h-full md:w-[440px] md:shrink-0 md:overflow-y-auto">
          <header className="px-5 pb-2 pt-6">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{copy.legend.title}</h1>
              {meta?.source === 'mock' && (
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  {copy.mockBadge}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-neutral-600">{copy.tagline}</p>
          </header>

          {meta && (
            <div className="flex flex-col gap-4 p-5 pt-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <Legend />
              </div>
              {selectedSegment && (
                <SegmentCard segment={selectedSegment} meta={meta} onClose={() => setSelectedId(null)} />
              )}
              <RankList segments={segments} selectedId={selectedId} setSelectedId={setSelectedId} />
              {!selectedSegment && (
                <p className="rounded-2xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">
                  {copy.emptyStates.noSegmentSelected}
                </p>
              )}
              {/* WeightSliders is still a placeholder (P2); add it back once it owns weight state. */}
              <MethodBox weights={meta.default_weights} meta={meta} />
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
