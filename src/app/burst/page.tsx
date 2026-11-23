import type { Metadata } from "next";
import { BurstLab, type VariantSnapshot } from "@/components/burst/burst-lab";
import { CapacityPlanner } from "@/components/burst/capacity-planner";
import { PageHeader } from "@/components/site/page-header";
import { DEFAULT_PARAMS, PRESETS, VARIANTS, VARIANT_KEYS, runComparison, type VariantKey } from "@/lib/reliability/scenario";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Burst lab" };

export default async function BurstPage() {
  const runs = await runComparison(DEFAULT_PARAMS);
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
      <PageHeader eyebrow="Reliability · 429s under load" title="Burst lab">
        <p>
          Three reps ask at once, each prompt carrying about 14,500 tokens of retrieved context, against a simulated tier of 30,000 tokens per
          minute. The same burst runs through three clients: where the 429s come from, and what removes them.
        </p>
      </PageHeader>
      <div className="space-y-8">
        <BurstLab initial={initial} initialParams={DEFAULT_PARAMS} presets={PRESETS} variants={VARIANTS} />
        <CapacityPlanner promptTokens={DEFAULT_PARAMS.promptTokens} trimmedTokens={DEFAULT_PARAMS.trimmedTokens} maxOutputTokens={DEFAULT_PARAMS.maxOutputTokens} />
      </div>
    </>
  );
}
