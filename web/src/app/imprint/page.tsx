import type { Metadata } from 'next';
import LegalPage, { Field, Section } from '@/components/LegalPage';
import { legalCopy, operator } from '@/content/legal';

const t = legalCopy.imprint;

export const metadata: Metadata = { title: `${t.title} · SafeLane HN` };

export default function Imprint() {
  return (
    <LegalPage title={t.title}>
      <Section title={t.providerTitle}>
        <p>
          <Field value={operator.name} label="Operator name" />
        </p>
        {operator.address ? (
          operator.address.map((line) => <p key={line}>{line}</p>)
        ) : (
          <p>
            <Field value={null} label="Postal address" />
          </p>
        )}
        {operator.representedBy && (
          <p>
            {t.representedBy}: {operator.representedBy}
          </p>
        )}
      </Section>
      <Section title={t.contactTitle}>
        <p>
          Email: <Field value={operator.email} label="Email" />
        </p>
        <p>
          Phone: <Field value={operator.phone} label="Phone" />
        </p>
      </Section>
      <Section title={t.contentTitle}>
        <p>
          <Field value={operator.contentResponsible} label="Name and address" />
        </p>
      </Section>
      <Section title={t.sourcesTitle}>
        <ul className="list-disc space-y-1 pl-5">
          {t.sources.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Section>
      <Section title={t.disclaimerTitle}>
        <p>{t.disclaimer}</p>
      </Section>
    </LegalPage>
  );
}
