/**
 * The kit's mark: three reps from the retry-queue timeline on /burst. Two are
 * answered at once (bars of the same length); the third waits its turn in
 * line, then is answered instead of getting a 429. Same rectangles as
 * design/mark.py, which also draws the favicon and the home-screen icon.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="4" y="4" width="14" height="6" rx="1.5" className="fill-primary" />
      <rect x="4" y="12" width="14" height="6" rx="1.5" className="fill-primary" />
      <rect x="4" y="20" width="20" height="6" rx="1.5" className="fill-seg-queued" />
      <rect x="20" y="20" width="8" height="6" rx="1.5" className="fill-primary" />
    </svg>
  );
}
