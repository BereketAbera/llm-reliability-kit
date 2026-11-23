"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { thousands } from "@/lib/format";
import { cn } from "@/lib/utils";

const TIERS = [30_000, 90_000, 450_000];

export function CapacityPlanner({ promptTokens, trimmedTokens, maxOutputTokens }: { promptTokens: number; trimmedTokens: number; maxOutputTokens: number }) {
  const [reps, setReps] = useState(10);
  const rows = [
    { label: "Whole documents", prompt: promptTokens },
    { label: "Trimmed context", prompt: trimmedTokens },
  ].map((row) => {
    const perRequest = row.prompt + maxOutputTokens;
    return { ...row, perRequest, needed: perRequest * reps };
  });

  return (
    <section aria-labelledby="capacity-title" className="rounded-xl border bg-background p-4 sm:p-5">
      <h2 id="capacity-title" className="text-xl font-semibold tracking-tight">
        Capacity planner: limits for a group of reps
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Worst case is every rep asking in the same minute. Size the tokens-per-minute limit for that, then let the queue absorb the rest.
      </p>
      <div className="mt-4 max-w-md space-y-3">
        <div className="flex items-baseline justify-between">
          <Label id="planner-reps">Reps asking in the same minute</Label>
          <span className="text-sm font-semibold tabular">{reps}</span>
        </div>
        <Slider aria-labelledby="planner-reps" value={[reps]} min={1} max={40} step={1} onValueChange={(v) => setReps(v[0] ?? reps)} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">Tokens per minute needed for {reps} reps</caption>
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="py-2 pr-3 font-medium">Prompt</th>
              <th scope="col" className="py-2 pr-3 font-medium">Per request</th>
              <th scope="col" className="py-2 pr-3 font-medium">TPM needed for {reps}</th>
              {TIERS.map((tier) => (
                <th key={tier} scope="col" className="py-2 pr-3 font-medium">
                  Fits per minute at {thousands(tier)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b last:border-0">
                <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                  {row.label} <span className="font-normal text-muted-foreground tabular">({thousands(row.prompt)})</span>
                </th>
                <td className="py-2.5 pr-3 tabular">{thousands(row.perRequest)}</td>
                <td className="py-2.5 pr-3 font-semibold tabular">{thousands(row.needed)}</td>
                {TIERS.map((tier) => {
                  const fits = Math.floor(tier / row.perRequest);
                  return (
                    <td key={tier} className={cn("py-2.5 pr-3 tabular", fits >= reps ? "text-ok" : "text-bad")}>
                      {fits} {fits >= reps ? "(enough)" : "(queue)"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className="mt-5 grid list-decimal gap-x-8 gap-y-2 pl-5 text-sm leading-relaxed md:grid-cols-2">
        <li>
          <strong>Trim the prompt first.</strong> Send the matched section and top lines, not whole documents. The same tier then serves about {Math.floor(rows[0].perRequest / rows[1].perRequest * 10) / 10}x more questions a minute.
        </li>
        <li>
          <strong>Set max_tokens to the real answer length.</strong> It is reserved against the budget when the request arrives, even if the answer is short.
        </li>
        <li>
          <strong>Know which limits apply.</strong> Check the tier for the model on the key the app really uses. One shared key means every rep and every instance draws from one budget.
        </li>
        <li>
          <strong>One queue per key.</strong> With more than one server instance, keep the token bucket in shared storage (Postgres or Redis) so each instance does not assume it has the whole budget.
        </li>
        <li>
          <strong>Retry on the provider&apos;s schedule.</strong> Honor retry-after, add jitter, cap retries, and tell the rep calmly when the wait would be too long.
        </li>
        <li>
          <strong>Alert on 429s, not only failures.</strong> 429s that retries absorb are the early warning that the tier is too small.
        </li>
      </ol>
    </section>
  );
}
