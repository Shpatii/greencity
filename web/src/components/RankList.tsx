import type { SegmentFeature } from '@/lib/loadData';
import { copy } from '@/content/copy';
import { scoreToColor } from '@/content/theme';

interface Props {
  segments: SegmentFeature[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

export default function RankList({ segments, selectedId, setSelectedId }: Props) {
  const top10 = segments
    .filter((f) => f.properties.eligible && f.properties.rank !== null)
    .sort((a, b) => (a.properties.rank ?? Infinity) - (b.properties.rank ?? Infinity))
    .slice(0, 10);

  return (
    <div className="overflow-hidden rounded-xl bg-white/90 shadow-lg backdrop-blur-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">{copy.rankList.title}</h2>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs text-gray-400">
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
                className={`cursor-pointer border-b border-gray-50 transition-colors last:border-0 hover:bg-blue-50 ${
                  isSelected ? 'bg-blue-100' : ''
                }`}
              >
                <td className="w-8 px-4 py-2.5 font-mono text-xs text-gray-400">
                  {p.rank}
                </td>
                <td className="max-w-[120px] truncate px-2 py-2.5 text-gray-800">
                  {p.name ?? copy.unnamed}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: scoreToColor(score) }}
                    />
                    <span className="font-medium tabular-nums text-gray-800">
                      {score.toFixed(1)}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-500">
                  {p.n_points}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
