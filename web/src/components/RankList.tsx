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
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        <span aria-live="polite" className="text-xs font-medium text-blue-800">
          {changed && copy.rankList.changed}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs text-gray-600">
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
                className={`cursor-pointer border-b border-gray-50 transition-colors last:border-0 hover:bg-neutral-50 ${
                  isSelected ? 'bg-blue-100' : ''
                }`}
              >
                <td className="w-8 px-4 py-2.5 font-mono text-xs text-gray-600">
                  {p.rank}
                </td>
                <td className="max-w-[220px] truncate px-2 py-2.5 text-gray-800">
                  {p.name ?? copy.unnamed}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-inset ring-black/40"
                      style={{ backgroundColor: colorForScore(score) }}
                    />
                    <span className="font-medium tabular-nums text-gray-800">
                      {score.toFixed(1)}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-600">
                  {p.n_points}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {top10.length === 0 && (
        <p className="px-4 py-3 text-sm text-gray-600">{emptyText}</p>
      )}
    </section>
  );
}
