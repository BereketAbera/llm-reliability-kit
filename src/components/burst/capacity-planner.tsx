"use client";

import { CircleCheck, Hourglass } from "lucide-react";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { thousands } from "@/lib/format";
import { cn } from "@/lib/utils";

const TIERS = [30_000, 90_000, 450_000];

export function CapacityPlanner({ promptTokens, trimmedTokens, maxOutputTokens }: { promptTokens: number; trimmedTokens: number; maxOutputTokens: number }) {
  const [reps, setReps] = useState(10);
  const rows = [
    { label: "Today’s prompts", hint: `${thousands(promptTokens)} tokens`, prompt: promptTokens },
    { label: "Smaller prompts", hint: `${thousands(trimmedTokens)}-token target`, prompt: trimmedTokens },
  ].map((row) => {
    const perRequest = row.prompt + maxOutputTokens;
    return { ...row, perRequest, needed: perRequest * reps };
  });

  return (
    <section aria-labelledby="capacity-title" className="rounded-xl border bg-background p-4 sm:p-5">
      <h2 id="capacity-title" className="text-base font-semibold">
        Capacity planner: limits for a group of reps
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        The worst case is every rep asking in the same minute. Size the tokens-per-minute limit for that, and let the queue absorb anything above it:
        those reps wait instead of seeing an error.
      </p>
      <div className="mt-4 max-w-md space-y-3">
        <div className="flex items-baseline justify-between">
          <Label id="planner-reps">Reps asking in the same minute</Label>
          <span className="text-sm font-semibold tabular">{reps}</span>
        </div>
        <Slider aria-labelledby="planner-reps" value={[reps]} min={1} max={40} step={1} onValueChange={(v) => setReps(v[0] ?? reps)} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border p-3">
            <h3 className="font-semibold">
              {row.label} <span className="font-normal text-muted-foreground tabular">({row.hint})</span>
            </h3>
            <p className="mt-1 text-sm text-muted-foreground tabular">
              {thousands(row.perRequest)} tokens per request · {reps} reps need <span className="font-semibold text-foreground">{thousands(row.needed)}</span> tokens a minute
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {TIERS.map((tier) => {
                const fits = Math.floor(tier / row.perRequest);
                const enough = fits >= reps;
                return (
                  <li key={tier} className="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-2.5 py-1.5">
                    <span className="whitespace-nowrap tabular">{thousands(tier)} / min</span>
                    <span className={cn("flex items-center gap-1.5 text-right font-medium tabular", enough ? "text-ok" : "text-warn")}>
                      {enough ? <CircleCheck className="size-4 shrink-0" aria-hidden /> : <Hourglass className="size-4 shrink-0" aria-hidden />}
                      {enough ? `all ${reps} at once` : `${fits} at once, rest wait`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <ol className="mt-5 grid list-decimal gap-x-8 gap-y-2 pl-5 text-sm leading-relaxed md:grid-cols-2">
        <li>
          <strong>Measure the prompt, then trim it.</strong> Count the tokens in one real prompt first. If most of it is pasted reference text, send the
          matched section and top lines instead: the same tier then serves about {Math.floor((rows[0].perRequest / rows[1].perRequest) * 10) / 10}x more
          questions a minute. The trim ships only if the 30-question score holds.
        </li>
        <li>
          <strong>Set max_tokens to the real answer length.</strong> It is reserved against the budget when the request arrives, even if the answer is short.
        </li>
        <li>
          <strong>Know which limits apply.</strong> Check the tier for the model on the key the app really uses. One shared key means every rep and every instance draws from one budget.
        </li>
        <li>
          <strong>One queue per key.</strong> With more than one server instance, keep the token bucket in shared storage (your existing Postgres works) so each instance does not assume it has the whole budget.
        </li>
        <li>
          <strong>Retry on the provider&apos;s schedule.</strong> Honor retry-after, add jitter, cap retries, and tell the rep to try again when the wait would be too long.
        </li>
        <li>
          <strong>Alert on 429s, not only failures.</strong> 429s that retries absorb are the early warning that the tier is too small.
        </li>
      </ol>
    </section>
  );
}
