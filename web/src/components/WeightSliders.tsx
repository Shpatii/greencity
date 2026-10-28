import { copy } from '@/content/copy';
import { FACTORS } from '@/lib/score';
import type { Weights } from '@/lib/types';
import { PRESETS, rebalance, sameWeights, type PresetKey } from '@/lib/weights';

interface Props {
  weights: Weights;
  defaults: Weights;
  onChange: (weights: Weights) => void;
}

// One slider per factor; moving one rescales the others so the total stays 100%.
export default function WeightSliders({ weights, defaults, onChange }: Props) {
  const text = copy.weightSliders;
  const isDefault = sameWeights(weights, defaults);

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">{text.title}</h2>
        <button
          type="button"
          onClick={() => onChange(defaults)}
          disabled={isDefault}
          className="rounded px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-default disabled:text-neutral-400 disabled:hover:bg-transparent"
        >
          {text.reset}
        </button>
      </div>
      <p className="mb-2 text-xs text-neutral-600">{text.hint}</p>
      <div role="group" aria-label={text.presetsLabel} className="mb-3 flex flex-wrap gap-1.5">
        {(Object.keys(PRESETS) as PresetKey[]).map((key) => {
          const active = sameWeights(weights, PRESETS[key]);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(PRESETS[key])}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                active ? 'bg-blue-700 text-white ring-blue-700' : 'text-blue-800 ring-blue-200 hover:bg-blue-50'
              }`}
            >
              {text.presets[key]}
            </button>
          );
        })}
      </div>
      <ul className="space-y-2">
        {FACTORS.map((key) => {
          const label = copy.factorLabels[key];
          const pct = Math.round(weights[key] * 100);
          return (
            <li key={key} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 text-sm">
              <span className="text-neutral-800" title={copy.factorTooltips[key]}>{label}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={pct}
                aria-label={text.sliderLabel(label)}
                aria-valuetext={`${pct}%`}
                onChange={(e) => onChange(rebalance(weights, key, Number(e.target.value) / 100))}
                className="w-full accent-blue-700"
              />
              <span className="text-right tabular-nums text-neutral-700">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
