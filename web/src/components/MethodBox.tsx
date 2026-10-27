'use client';

import { useId, useState } from 'react';
import { copy } from '@/content/copy';
import type { FactorKey, Meta, Weights } from '@/lib/types';

const FACTORS: FactorKey[] = ['safety', 'danger', 'surface', 'air', 'flow'];

interface Props {
  weights: Weights;
  meta: Meta;
}

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(date);
}

export default function MethodBox({ weights, meta }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const text = copy.methodBox;

  return (
    <section className="rounded border border-neutral-200">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-2 rounded px-3 text-left text-sm font-semibold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={`h-4 w-4 shrink-0 text-neutral-700 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        >
          <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {text.toggle}
      </button>

      <div
        id={panelId}
        role="region"
        aria-label={text.title}
        hidden={!open}
        className="space-y-3 border-t border-neutral-200 px-3 py-3 text-sm text-neutral-800"
      >
        <p>{text.explanation}</p>

        <table className="w-full text-left">
          <caption className="mb-1 text-left text-xs font-semibold uppercase tracking-wide text-neutral-700">
            {text.weightsCaption}
          </caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">{text.factorHeader}</th>
              <th scope="col">{text.weightHeader}</th>
            </tr>
          </thead>
          <tbody>
            {FACTORS.map((key) => (
              <tr key={key} className="border-b border-neutral-100 last:border-0">
                <th scope="row" className="py-1 font-normal">
                  {copy.factorLabels[key]}
                </th>
                <td className="py-1 text-right tabular-nums">{Math.round(weights[key] * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-700">{text.limitsTitle}</h3>
          <ul className="list-disc space-y-1 pl-5">
            {text.limits.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-neutral-700">{text.dataSource(formatGeneratedAt(meta.generated_at))}</p>
      </div>
    </section>
  );
}
