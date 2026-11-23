import { BUCKET_MINUTES, DAY_MINUTES, DEPLOY_MINUTE, ERROR_RATE_THRESHOLD, clockLabel, type Bucket } from "@/lib/monitoring/monitor";

/** Bars: requests per 15 minutes. Line: error rate. Dashed: 5% alert threshold. */
export function ErrorRateChart({ buckets }: { buckets: Bucket[] }) {
  const width = 960;
  const height = 280;
  const pad = { top: 16, right: 44, bottom: 30, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxRequests = Math.max(...buckets.map((b) => b.requests), 1);
  const maxRate = 0.4;
  const x = (minute: number) => pad.left + (minute / DAY_MINUTES) * innerW;
  const yRate = (rate: number) => pad.top + innerH - (Math.min(rate, maxRate) / maxRate) * innerH;
  const yReq = (n: number) => pad.top + innerH - (n / maxRequests) * innerH;
  const barW = (BUCKET_MINUTES / DAY_MINUTES) * innerW - 2;
  const line = buckets.map((b, i) => `${i === 0 ? "M" : "L"}${(x(b.start) + barW / 2 + 1).toFixed(1)},${yRate(b.errorRate).toFixed(1)}`).join(" ");
  const hours = Array.from({ length: 13 }, (_, i) => i * 60);
  const before = buckets.filter((b) => b.start < DEPLOY_MINUTE);
  const worst = before.reduce((a, b) => (b.errorRate > a.errorRate ? b : a), before[0]);

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-labelledby="chart-title chart-desc">
        <title id="chart-title">Error rate over the simulated day</title>
        <desc id="chart-desc">
          Before the resilient client shipped at {clockLabel(DEPLOY_MINUTE)}, the error rate peaked at {Math.round(worst.errorRate * 100)}% at {clockLabel(worst.start)}. After it, failed
          answers dropped to zero.
        </desc>
        {[0, 0.1, 0.2, 0.3, 0.4].map((rate) => (
          <g key={rate}>
            <line x1={pad.left} x2={width - pad.right} y1={yRate(rate)} y2={yRate(rate)} className="stroke-border" strokeWidth={1} />
            <text x={pad.left - 8} y={yRate(rate) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {Math.round(rate * 100)}%
            </text>
          </g>
        ))}
        {[0, Math.round(maxRequests / 2), maxRequests].map((n) => (
          <text key={n} x={width - pad.right + 8} y={yReq(n) + 4} className="fill-muted-foreground text-[11px]">
            {n}
          </text>
        ))}
        {buckets.map((b) => (
          <rect key={b.start} x={x(b.start) + 1} y={yReq(b.requests)} width={barW} height={pad.top + innerH - yReq(b.requests)} className="fill-seg-queued" rx={1.5} />
        ))}
        <line x1={pad.left} x2={width - pad.right} y1={yRate(ERROR_RATE_THRESHOLD)} y2={yRate(ERROR_RATE_THRESHOLD)} className="stroke-warn" strokeDasharray="5 4" strokeWidth={1.5} />
        <text x={width - pad.right - 4} y={yRate(ERROR_RATE_THRESHOLD) - 6} textAnchor="end" className="fill-warn text-[11px] font-medium">
          alert at 5%
        </text>
        <line x1={x(DEPLOY_MINUTE)} x2={x(DEPLOY_MINUTE)} y1={pad.top} y2={pad.top + innerH} className="stroke-primary" strokeWidth={1.5} />
        <text x={x(DEPLOY_MINUTE) + 6} y={pad.top + 12} className="fill-primary text-[11px] font-medium">
          {clockLabel(DEPLOY_MINUTE)} resilient client shipped
        </text>
        <path d={line} fill="none" className="stroke-bad" strokeWidth={2.25} strokeLinejoin="round" />
        {buckets.map((b) =>
          b.failed > 0 ? <circle key={`p${b.start}`} cx={x(b.start) + barW / 2 + 1} cy={yRate(b.errorRate)} r={2.5} className="fill-bad" /> : null,
        )}
        {hours.map((m) => (
          <text key={m} x={x(m)} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {clockLabel(m)}
          </text>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 bg-bad" aria-hidden /> Error rate (failed answers ÷ requests, left axis)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-seg-queued" aria-hidden /> Requests per 15 minutes (right axis)
        </span>
      </figcaption>
    </figure>
  );
}
