import { cn } from "@/lib/utils";

export function CodeBlock({ code, label, className }: { code: string; label?: string; className?: string }) {
  return (
    <figure className={cn("overflow-hidden rounded-xl border bg-[oklch(0.2_0.02_256)] text-[oklch(0.94_0.01_256)]", className)}>
      {label ? <figcaption className="border-b border-white/10 px-4 py-2 font-mono text-xs text-white/70">{label}</figcaption> : null}
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </figure>
  );
}
