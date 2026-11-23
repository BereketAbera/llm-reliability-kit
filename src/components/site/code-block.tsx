import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A code excerpt. Long lines scroll inside a focusable region (keyboard users can
 * reach the clipped part) with a fade on the right edge, or wrap when `wrap` is set.
 * With `collapsed`, it sits closed under a "Show the code" summary.
 */
export function CodeBlock({ code, label, className, wrap = false, collapsed }: { code: string; label?: string; className?: string; wrap?: boolean; collapsed?: string }) {
  const block = (
    <figure className={cn("overflow-hidden rounded-xl border bg-[oklch(0.2_0.02_256)] text-[oklch(0.94_0.01_256)]", !collapsed && className)}>
      {label ? <figcaption className="border-b border-white/10 px-4 py-2 font-mono text-xs break-all text-white/75">{label}</figcaption> : null}
      <pre
        tabIndex={wrap ? undefined : 0}
        role={wrap ? undefined : "region"}
        aria-label={wrap ? undefined : `${label ?? "Code"} (scrolls sideways)`}
        className={cn(
          "p-4 text-[13px] leading-relaxed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/70",
          wrap ? "break-words whitespace-pre-wrap" : "scroll-fade overflow-x-auto",
        )}
      >
        <code className="font-mono">{code}</code>
      </pre>
    </figure>
  );
  if (!collapsed) return block;
  return (
    <details className={cn("group/code rounded-xl", className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 transition-transform group-open/code:rotate-90 motion-reduce:transition-none" aria-hidden />
        {collapsed}
      </summary>
      <div className="mt-3">{block}</div>
    </details>
  );
}
