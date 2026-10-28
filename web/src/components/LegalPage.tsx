import type { ReactNode } from 'react';
import SiteNav from '@/components/SiteNav';
import { legalCopy } from '@/content/legal';

/** Layout for the imprint and privacy pages. */
export default function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <SiteNav />
      <main className="mx-auto max-w-2xl px-5 py-10 text-sm leading-relaxed text-neutral-800">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
        <div className="space-y-6">{children}</div>
      </main>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-neutral-900">{title}</h2>
      {children}
    </section>
  );
}

/** An operator detail, or a visible placeholder while it is not filled in (content/legal.ts). */
export function Field({ value, label }: { value: string | null; label: string }) {
  if (value) return <>{value}</>;
  return <span className="rounded bg-amber-100 px-1 text-amber-900">{legalCopy.missing(label)}</span>;
}
