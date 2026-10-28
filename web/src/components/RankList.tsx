import type { SegmentFeature } from '@/lib/loadData';
import { copy } from '@/content/copy';
import { colorForScore } from '@/content/theme';

interface Props {
  segments: SegmentFeature[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  /** Show the "Ranking changed" hint (the #1 street just changed). */
  changed?: boolean;
  /** Defaults to copy.rankList.title. */
  title?: string;
  /** Shown when there is nothing to list; defaults to copy.emptyStates.noEligibleSegments. */
  emptyText?: string;
}

export default function RankList({ segments, selectedId, setSelectedId, changed = false, title = copy.rankList.title,
  emptyText = copy.emptyStates.noEligibleSegments }: Props) {
  const top10 = segments
    .filter((f) => f.properties.eligible && f.properties.rank !== null)
    .sort((a, b) => (a.properties.rank ?? Infinity) - (b.properties.rank ?? Infinity))
    .slice(0, 10);

  return (
    <section className="overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-white/[0.08]">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{title}</h2>
        <span aria-live="polite" className="text-xs font-medium text-amber-300">
          {changed && copy.rankList.changed}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-neutral-500">
            <th className="w-8 px-4 py-2 text-left font-medium">{copy.rankList.colRank}</th>
            <th className="px-2 py-2 text-left font-medium">{copy.rankList.colName}</th>
            <th className="px-2 py-2 text-right font-medium">{copy.rankList.colScore}</th>
            <th className="px-3 py-2 text-right font-medium">{copy.rankList.colPoints}</th>
          </tr>
        </thead>
        <tbody>
          {top10.map((f) => {
            const p = f.properties;
            const score = p.score ?? 0;
            const isSelected = p.id === selectedId;
            return (
              <tr
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`cursor-pointer border-t border-white/[0.06] transition-colors hover:bg-white/[0.06] ${
                  isSelected ? 'bg-white/10 shadow-[inset_3px_0_0_#22d3ee]' : ''
                }`}
              >
                <td className="w-8 px-4 py-2.5 font-mono text-xs text-neutral-500">
                  {p.rank}
                </td>
                <td className="max-w-[200px] truncate px-2 py-2.5 text-neutral-100">
                  {p.name ?? copy.unnamed}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: colorForScore(score), boxShadow: `0 0 8px ${colorForScore(score)}` }}
                    />
                    <span className="font-semibold tabular-nums text-white">
                      {score.toFixed(1)}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-neutral-500">
                  {p.n_points}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {top10.length === 0 && (
        <p className="px-4 py-3 text-sm text-neutral-400">{emptyText}</p>
      )}
    </section>
  );
}
