// Inline SVG illustrations for the Marketplace categories. Self-contained (no
// external image hosts — the app's CSP only allows Cloudinary/inline anyway).
// currentColor drives the main shapes, so a `text-brand` wrapper tints them.
import type { MarketCategory } from "../lib/marketplace";

function Shoe({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden>
      <path
        d="M6 41c0-2 1.4-3 3-3.2l17-2.4 7-6.4c1.7-1.5 4.2-1 5.2 1l1.8 3.6 9.4 3c2.6.8 4.2 2.2 4.2 4.8V45c0 1.7-1.2 2.8-3 2.8H9c-1.8 0-3-1.1-3-2.8v-4Z"
        fill="currentColor"
      />
      <path d="M13 41h34" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
      <path d="M22 37v6M28 35.5v7.5M34 34v9" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

function Volleyball({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden>
      <circle cx="32" cy="32" r="22" fill="currentColor" />
      <g stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.9">
        <path d="M32 10c-7 8-7 30 0 44" />
        <path d="M32 10c9 6 15 24 8 42" />
        <path d="M32 10c-9 6-15 24-8 42" />
        <path d="M12 22c10 4 30 4 40 0" />
        <path d="M11 40c8-5 34-5 42 0" />
      </g>
    </svg>
  );
}

function Court({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden>
      <path d="M12 20v26M52 20v26" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <rect x="12" y="20" width="40" height="15" fill="currentColor" />
      <g stroke="#fff" strokeWidth="1.2" opacity="0.9">
        <path d="M12 24.5h40M12 29h40M12 33.5h40" />
        <path d="M19 20v15M26 20v15M33 20v15M40 20v15M47 20v15" />
      </g>
      <path d="M8 46h48" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function CategoryArt({
  category,
  className = "",
}: {
  category: MarketCategory;
  className?: string;
}) {
  if (category === "shoes") return <Shoe className={className} />;
  if (category === "volleyballs") return <Volleyball className={className} />;
  return <Court className={className} />;
}
