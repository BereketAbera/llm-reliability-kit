import { BUCKET_MINUTES, DAY_MINUTES, DEPLOY_MINUTE, ERROR_RATE_THRESHOLD, clockLabel, type Bucket } from "@/lib/monitoring/monitor";

/**
 * Bars: questions per 15 minutes (right axis). Stacked on the left axis, as a share of
 * questions asked: 429 errors (red) at the bottom, reps told to try again (amber) on top,
 * so the top edge is the unanswered rate the 5% alert watches. Dashed: that threshold.
 */
export function ErrorRateChart({ buckets }: { buckets: Bucket[] }) {
  const width = 640;
  const height = 300;
  const pad = { top: 34, right: 44, bottom: 30, left: 50 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxRequests = Math.max(...buckets.map((b) => b.requests), 1);
  const worstRate = Math.max(...buckets.map((b) => b.errorRate), ERROR_RATE_THRESHOLD);
  const maxRate = Math.max(0.2, Math.ceil(worstRate * 10) / 10);
  const rateTicks = Array.from({ length: Math.round(maxRate / 0.05) + 1 }, (_, i) => i * 0.05).filter((_, i, all) => all.length <= 6 || i % 2 === 0);
  const x = (minute: number) => pad.left + (minute / DAY_MINUTES) * innerW;
  const yRate = (rate: number) => pad.top + innerH - (Math.min(rate, maxRate) / maxRate) * innerH;
  const yReq = (n: number) => pad.top + innerH - (n / maxRequests) * innerH;
  const barW = (BUCKET_MINUTES / DAY_MINUTES) * innerW - 2;
  const cx = (b: Bucket) => x(b.start) + barW / 2 + 1;
  const point = (b: Bucket, rate: number) => `${cx(b).toFixed(1)},${yRate(rate).toFixed(1)}`;

  // The two causes, stacked: 429s from the bottom, "try again" on top of them.
  const errors = buckets.map((b) => (b.requests ? b.failed / b.requests : 0));
  const unanswered = buckets.map((b) => b.errorRate);
  const band = (upper: number[], lower: number[]) =>
    `M${buckets.map((b, i) => point(b, upper[i])).join("L")}L${buckets.map((b, i) => point(b, lower[i])).reverse().join("L")}Z`;
  // An edge is drawn only where its cause is present, so the red stops where the 429s stop.
  const edge = (values: number[], present: (b: Bucket) => boolean) => {
    let d = "";
    let open = false;
    for (let i = 0; i < buckets.length - 1; i++) {
      if (present(buckets[i]) || present(buckets[i + 1])) {
        d += open ? `L${point(buckets[i + 1], values[i + 1])}` : `M${point(buckets[i], values[i])}L${point(buckets[i + 1], values[i + 1])}`;
        open = true;
      } else {
        open = false;
      }
    }
    return d;
  };

  const hours = Array.from({ length: 13 }, (_, i) => i * 60);
  const before = buckets.filter((b) => b.start < DEPLOY_MINUTE);
  const after = buckets.filter((b) => b.start >= DEPLOY_MINUTE);
  const worst = (list: Bucket[]) => list.reduce((a, b) => (b.errorRate > a.errorRate ? b : a), list[0]);
  const total = (list: Bucket[], key: "failed" | "busy") => list.reduce((sum, b) => sum + b[key], 0);
  const worstBefore = worst(before);
  const worstAfter = worst(after);
  const pct = (rate: number) => `${Math.round(rate * 100)}%`;
  const label = "fill-muted-foreground text-[20px] sm:text-[11px]";

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-labelledby="chart-title chart-desc">
        <title id="chart-title">Error rate over the simulated day</title>
        <desc id="chart-desc">
          Before the retry queue shipped at {clockLabel(DEPLOY_MINUTE)}, {total(before, "failed")} questions got a 429 error and {total(before, "busy")} were told to
          try again; the unanswered share peaked at {pct(worstBefore.errorRate)} at {clockLabel(worstBefore.start)}. After it, {total(after, "failed")} got a
          429 error and {total(after, "busy")} were told to try again; the peak was {pct(worstAfter.errorRate)} at {clockLabel(worstAfter.start)}.
        </desc>
        {/* Axis titles fit at desktop size; on phones the legend below names the axes. */}
        <text x={4} y={14} className="hidden fill-muted-foreground sm:inline sm:text-[11px]">
          unanswered
        </text>
        <text x={width - 4} y={14} textAnchor="end" className="hidden fill-muted-foreground sm:inline sm:text-[11px]">
          questions / 15 min
        </text>
        {rateTicks.map((rate) => (
          <g key={rate}>
            <line x1={pad.left} x2={width - pad.right} y1={yRate(rate)} y2={yRate(rate)} className="stroke-border" strokeWidth={1} />
            <text x={pad.left - 8} y={yRate(rate) + 4} textAnchor="end" className={label}>
              {Math.round(rate * 100)}%
            </text>
          </g>
        ))}
        {[0, Math.round(maxRequests / 2), maxRequests].map((n) => (
          <text key={n} x={width - pad.right + 6} y={yReq(n) + 4} className={label}>
            {n}
          </text>
        ))}
        {buckets.map((b) => (
          <rect key={b.start} x={x(b.start) + 1} y={yReq(b.requests)} width={barW} height={pad.top + innerH - yReq(b.requests)} className="fill-control-track opacity-60" rx={1.5} />
        ))}
        <line x1={pad.left} x2={width - pad.right} y1={yRate(ERROR_RATE_THRESHOLD)} y2={yRate(ERROR_RATE_THRESHOLD)} className="stroke-muted-foreground" strokeDasharray="5 4" strokeWidth={1.25} />
        <line x1={x(DEPLOY_MINUTE)} x2={x(DEPLOY_MINUTE)} y1={pad.top - 6} y2={pad.top + innerH} className="stroke-primary" strokeWidth={1.5} />
        <path d={band(errors, unanswered.map(() => 0))} className="fill-bad opacity-20" />
        <path d={band(unanswered, errors)} className="fill-warn opacity-25" />
        <path d={edge(unanswered, (b) => b.busy > 0)} fill="none" className="stroke-warn" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={edge(errors, (b) => b.failed > 0)} fill="none" className="stroke-bad" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {buckets.map((b, i) => (
          <g key={`p${b.start}`}>
            {b.failed > 0 ? <circle cx={cx(b)} cy={yRate(errors[i])} r={2.25} className="fill-bad" /> : null}
            {b.busy > 0 ? <circle cx={cx(b)} cy={yRate(unanswered[i])} r={2.25} className="fill-warn" /> : null}
          </g>
        ))}
        <text x={x(DEPLOY_MINUTE) + 6} y={pad.top - 10} className="text-halo fill-primary text-[20px] font-medium sm:text-[11px]">
          {clockLabel(DEPLOY_MINUTE)} retry queue shipped
        </text>
        <text x={pad.left + 4} y={yRate(ERROR_RATE_THRESHOLD) - 6} className="text-halo fill-muted-foreground text-[20px] font-medium sm:text-[11px]">
          alert at 5%
        </text>
        {hours.map((m, i) => (
          <text key={m} x={x(m)} y={height - 8} textAnchor="middle" className={i % 3 === 0 ? label : "hidden fill-muted-foreground sm:inline sm:text-[11px]"}>
            {clockLabel(m)}
          </text>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-[2px] border-t-2 border-bad bg-bad/20" aria-hidden /> 429 errors
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-[2px] border-t-2 border-warn bg-warn/25" aria-hidden /> Told to try again
        </span>
        <span>Stacked, as a share of questions asked (left axis)</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-[2px] bg-control-track" aria-hidden /> Questions per 15 minutes (right axis)
        </span>
      </figcaption>
    </figure>
  );
}
