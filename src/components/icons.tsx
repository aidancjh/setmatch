// Minimal stroke icons (24x24, currentColor) — clean and consistent, the way
// big apps do their tab bars. Pass className to size/color via Tailwind.
type IconProps = { className?: string; filled?: boolean };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function SearchIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </svg>
  );
}

export function UserIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 1.5 6.5 2 7H4c.5-.5 2-2 2-7Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function VolleyballIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3c3 3 3 15 0 18M3.5 9c4 1.5 13 1.5 17 0M5 18c2-3.5 9-7.5 14-6.5" />
    </svg>
  );
}
