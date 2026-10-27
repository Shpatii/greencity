import Link from 'next/link';
import { copy } from '@/content/copy';

interface Props {
  /** Fixed over a full-bleed page (landing) or in the flow above the app (map). */
  overlay?: boolean;
}

// Translucent dark bar shared by the landing page and the map.
export default function SiteNav({ overlay = false }: Props) {
  return (
    <nav
      className={`${
        overlay ? 'fixed inset-x-0 top-0 bg-black/70 backdrop-blur-xl backdrop-saturate-150' : 'relative shrink-0 bg-black'
      } z-50 h-12 border-b border-white/10`}
    >
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 text-xs text-neutral-300">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-amber-300 to-rose-500" />
          {copy.appTitle}
        </Link>
        <div className="flex items-center gap-5 sm:gap-7">
          <Link href="/" className="hidden transition-colors hover:text-white sm:inline">
            {copy.nav.overview}
          </Link>
          <Link href="/#signals" className="hidden transition-colors hover:text-white sm:inline">
            {copy.nav.method}
          </Link>
          <Link
            href="/map"
            className="rounded-full bg-white px-3 py-1 font-medium text-black transition-colors hover:bg-neutral-200"
          >
            {copy.nav.openMap}
          </Link>
        </div>
      </div>
    </nav>
  );
}
