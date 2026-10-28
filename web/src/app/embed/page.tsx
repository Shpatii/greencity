'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { loadData, type SegmentFeature } from '@/lib/loadData';
import type { RankedSegment } from '@/lib/score';
import { topSegments } from '@/lib/stats';
import type { Meta } from '@/lib/types';
import { copy } from '@/content/copy';
import RankList from '@/components/RankList';
import Legend from '@/components/Legend';

// maplibre-gl touches window, so keep it out of the server render.
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

// For iframes (Green City Dashboard): map, legend and top 5 with the published scores, no nav.
export default function EmbedPage() {
  const [segments, setSegments] = useState<SegmentFeature[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
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

  // No sliders here: the map shows the published (default-weight) scores.
  const ranking = useMemo<RankedSegment[]>(
    () => segments.map(({ properties: p }) => ({ id: p.id, score: p.score, rank: p.rank })),
    [segments],
  );
  const top5 = useMemo(() => topSegments(segments, 5), [segments]);
  const fullMapHref = selectedId ? `/map?id=${encodeURIComponent(selectedId)}` : '/map';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0b0b0c] text-neutral-100 sm:flex-row">
      <section className="relative min-h-0 flex-1">
        {meta ? (
          <MapView
            segments={segments}
            ranking={ranking}
            meta={meta}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            {error ? copy.loadError : copy.loading}
          </div>
        )}
      </section>

      {meta && (
        <aside className="flex max-h-[60%] flex-col gap-3 overflow-y-auto border-white/10 p-3 sm:max-h-none sm:w-[400px] sm:shrink-0 sm:border-l">
          <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-inset ring-white/[0.08]">
            <Legend />
          </div>
          <RankList
            segments={top5}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            title={copy.embed.listTitle}
          />
          <a
            href={fullMapHref}
            target="_blank"
            rel="noopener"
            className="self-end rounded px-1 text-xs font-medium text-amber-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            {copy.embed.openFull}
          </a>
        </aside>
      )}
    </div>
  );
}
