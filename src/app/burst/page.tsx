import type { Metadata } from "next";
import { BurstLab, type VariantSnapshot } from "@/components/burst/burst-lab";
import { CapacityPlanner } from "@/components/burst/capacity-planner";
import { PageHeader } from "@/components/site/page-header";
import { percent, thousands } from "@/lib/format";
import { monitoringSnapshot } from "@/lib/monitoring/monitor";
import { DEFAULT_PARAMS, PRESETS, VARIANTS, VARIANT_KEYS, runComparison, type VariantKey } from "@/lib/reliability/scenario";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Fixing the 429s" };

export default async function BurstPage() {
  const [runs, monitoring] = await Promise.all([runComparison(DEFAULT_PARAMS), monitoringSnapshot()]);
  const initial = Object.fromEntries(
    VARIANT_KEYS.map((key) => {
      const run = runs[key];
      const snapshot: VariantSnapshot = {
        timelines: run.timelines,
        summary: run.summary,
        provider: run.provider,
        promptTokens: run.promptTokens,
        status: "done",
        now: run.summary.finishedAtMs,
      };
      return [key, snapshot];
    }),
  ) as Record<VariantKey, VariantSnapshot>;

  return (
    <>
      <PageHeader eyebrow="Burst lab · reliability under load" title="Fixing the 429s">
        <p>
          Three reps ask at once with prompts of about {thousands(DEFAULT_PARAMS.promptTokens)} tokens, against an assumed limit of{" "}
          {thousands(DEFAULT_PARAMS.tpm)} tokens per minute. The same burst runs through three clients: where the 429s come from, and what removes them.
        </p>
        <p className="mt-2 text-sm">
          The burst uses questions the answer bank does not cover, so each one calls the model. Answer-bank hits never call the model, so common
          questions cannot hit a 429 (about {percent(monitoring.bankShare)} of questions in the simulated day).
        </p>
      </PageHeader>
      <div className="space-y-8">
        <BurstLab initial={initial} initialParams={DEFAULT_PARAMS} presets={PRESETS} variants={VARIANTS} />
        <CapacityPlanner promptTokens={DEFAULT_PARAMS.promptTokens} trimmedTokens={DEFAULT_PARAMS.trimmedTokens} maxOutputTokens={DEFAULT_PARAMS.maxOutputTokens} />
      </div>
    </>
  );
}
