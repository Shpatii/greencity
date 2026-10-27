'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { loadData, type SegmentCollection } from '@/lib/loadData';
import type { Meta } from '@/lib/types';
import RankList from '@/components/RankList';
import SegmentCard from '@/components/SegmentCard';
import WeightSliders from '@/components/WeightSliders';
import MethodBox from '@/components/MethodBox';
import Legend from '@/components/Legend';

// maplibre-gl touches window, so keep it out of the server render.
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function Page() {
  const [segments, setSegments] = useState<SegmentCollection | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData()
      .then(({ segments, meta }) => {
        setSegments(segments);
        setMeta(meta);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main className="flex h-screen flex-col md:flex-row">
      <section className="h-[60vh] w-full shrink-0 md:h-full md:w-[65%]">
        {segments && meta ? (
          <MapView segments={segments} bbox={meta.bbox} />
        ) : (
          <div className="flex h-full items-center justify-center bg-neutral-100 text-sm text-neutral-500">
            {error ?? 'Loading data…'}
          </div>
        )}
      </section>

      <aside className="flex w-full flex-col border-t border-neutral-200 md:h-full md:w-[35%] md:overflow-y-auto md:border-l md:border-t-0">
        <header className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3">
          <h1 className="text-xl font-semibold">SafeLane HN</h1>
          {meta?.source === 'mock' && (
            <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Mock data
            </span>
          )}
        </header>
        <div className="flex flex-col gap-3 p-4">
          <WeightSliders />
          <RankList />
          <SegmentCard />
          <Legend />
          <MethodBox />
        </div>
      </aside>
    </main>
  );
}
