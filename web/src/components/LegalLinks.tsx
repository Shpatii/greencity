import Link from 'next/link';
import { legalCopy } from '@/content/legal';

interface Props {
  className?: string;
  /** Open in a new tab (from the /embed iframe). */
  external?: boolean;
}

export default function LegalLinks({ className = '', external = false }: Props) {
  const target = external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <p className={`flex gap-3 ${className}`}>
      <Link href="/imprint" className="underline-offset-2 hover:underline" {...target}>
        {legalCopy.links.imprint}
      </Link>
      <Link href="/privacy" className="underline-offset-2 hover:underline" {...target}>
        {legalCopy.links.privacy}
      </Link>
    </p>
  );
}
