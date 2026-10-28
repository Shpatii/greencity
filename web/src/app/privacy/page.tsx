import type { Metadata } from 'next';
import LegalPage, { Field, Section } from '@/components/LegalPage';
import { legalCopy, operator } from '@/content/legal';

const t = legalCopy.privacy;

export const metadata: Metadata = { title: `${t.title} · SafeLane HN` };

export default function Privacy() {
  return (
    <LegalPage title={t.title}>
      <Section title={t.controllerTitle}>
        <p>
          <Field value={operator.name} label="Operator name" />
        </p>
        {operator.address?.map((line) => <p key={line}>{line}</p>)}
        <p>
          Email: <Field value={operator.email} label="Email" />
        </p>
      </Section>
      <Section title={t.visitTitle}>
        <p>
          {t.visit(
            operator.host ?? legalCopy.missing('Hosting provider'),
            operator.logRetention ?? legalCopy.missing('Log retention'),
          )}
        </p>
      </Section>
      <Section title={t.noTrackingTitle}>
        <p>{t.noTracking}</p>
      </Section>
      <Section title={t.embedTitle}>
        <p>{t.embed}</p>
      </Section>
      <Section title={t.rightsTitle}>
        <p>{t.rights}</p>
      </Section>
    </LegalPage>
  );
}
