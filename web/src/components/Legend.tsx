import { copy } from '@/content/copy';
import { noDataColor, scoreColors } from '@/content/theme';

// Compact horizontal legend: 5 score bands (low → high priority) plus a dashed "not enough data" sample.
export default function Legend() {
  const { title, bands, noData } = copy.legend;

  return (
    <section>
      <h2 className="mb-1.5 text-sm font-semibold text-neutral-900">
        {title}
      </h2>
      <div className="flex items-start gap-3">
        <ul className="grid flex-1 grid-cols-5 gap-0.5">
          {bands.map((band, i) => (
            <li key={band.label} className="flex min-w-0 flex-col">
              {/* Inset ring keeps the light yellow band visible on white. */}
              <span
                aria-hidden="true"
                className="h-3 rounded-sm ring-1 ring-inset ring-black/40"
                style={{ backgroundColor: scoreColors[i] }}
              />
              <span className="mt-1 text-xs leading-tight text-neutral-800">{band.label}</span>
              <span className="text-[11px] leading-tight text-neutral-600">{band.range}</span>
            </li>
          ))}
        </ul>
        <div className="flex w-20 shrink-0 flex-col">
          {/* Dashed line with a dark casing, like no-data streets on the map. */}
          <svg aria-hidden="true" viewBox="0 0 32 12" preserveAspectRatio="none" className="h-3 w-full">
            <line x1="1" y1="6" x2="31" y2="6" stroke="#525252" strokeWidth="5" strokeDasharray="6 4" />
            <line x1="1" y1="6" x2="31" y2="6" stroke={noDataColor} strokeWidth="3" strokeDasharray="6 4" />
          </svg>
          <span className="mt-1 text-xs leading-tight text-neutral-800">{noData}</span>
        </div>
      </div>
    </section>
  );
}
