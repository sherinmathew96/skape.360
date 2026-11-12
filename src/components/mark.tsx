/** The SKAPE360 mark: a wall corner on plan, closed by a door swing. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="flex-none">
      <rect width="64" height="64" rx="12" fill="#141414" />
      <path d="M18 46V18h28" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="square" />
      <path d="M18 46h14a14 14 0 0 0 14-14V18" fill="none" stroke="#6ea3ee" strokeWidth="4" strokeLinecap="square" />
    </svg>
  );
}
