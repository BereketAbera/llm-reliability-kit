import { BUCKET_MINUTES, DAY_MINUTES, DEPLOY_MINUTE, ERROR_RATE_THRESHOLD, clockLabel, type Bucket } from "@/lib/monitoring/monitor";

/** Bars: questions per 15 minutes. Line: share of questions left unanswered. Dashed: the 5% alert threshold. */
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
  const line = buckets.map((b, i) => `${i === 0 ? "M" : "L"}${(x(b.start) + barW / 2 + 1).toFixed(1)},${yRate(b.errorRate).toFixed(1)}`).join(" ");
  const hours = Array.from({ length: 13 }, (_, i) => i * 60);
  const before = buckets.filter((b) => b.start < DEPLOY_MINUTE);
  const after = buckets.filter((b) => b.start >= DEPLOY_MINUTE);
  const worst = (list: Bucket[]) => list.reduce((a, b) => (b.errorRate > a.errorRate ? b : a), list[0]);
  const worstBefore = worst(before);
  const worstAfter = worst(after);
  const label = "fill-muted-foreground text-[20px] sm:text-[11px]";

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-labelledby="chart-title chart-desc">
        <title id="chart-title">Error rate over the simulated day</title>
        <desc id="chart-desc">
          Before the retry queue shipped at {clockLabel(DEPLOY_MINUTE)}, the share of unanswered questions peaked at {Math.round(worstBefore.errorRate * 100)}% at{" "}
          {clockLabel(worstBefore.start)}. After it, the peak was {Math.round(worstAfter.errorRate * 100)}% at {clockLabel(worstAfter.start)}, with no hard failures.
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
        <line x1={pad.left} x2={width - pad.right} y1={yRate(ERROR_RATE_THRESHOLD)} y2={yRate(ERROR_RATE_THRESHOLD)} className="stroke-warn" strokeDasharray="5 4" strokeWidth={1.5} />
        <line x1={x(DEPLOY_MINUTE)} x2={x(DEPLOY_MINUTE)} y1={pad.top - 6} y2={pad.top + innerH} className="stroke-primary" strokeWidth={1.5} />
        <path d={line} fill="none" className="stroke-bad" strokeWidth={2} strokeLinejoin="round" />
        {buckets.map((b) =>
          b.unanswered > 0 ? <circle key={`p${b.start}`} cx={x(b.start) + barW / 2 + 1} cy={yRate(b.errorRate)} r={2.25} className="fill-bad" /> : null,
        )}
        <text x={x(DEPLOY_MINUTE) + 6} y={pad.top - 10} className="text-halo fill-primary text-[20px] font-medium sm:text-[11px]">
          {clockLabel(DEPLOY_MINUTE)} retry queue shipped
        </text>
        <text x={pad.left + 4} y={yRate(ERROR_RATE_THRESHOLD) - 6} className="text-halo fill-warn text-[20px] font-medium sm:text-[11px]">
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
          <span className="inline-block h-0.5 w-5 bg-bad" aria-hidden /> Unanswered questions ÷ questions asked (left axis)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-[2px] bg-control-track" aria-hidden /> Questions per 15 minutes (right axis)
        </span>
      </figcaption>
    </figure>
  );
}
