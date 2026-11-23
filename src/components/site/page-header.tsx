import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? <p className="mb-2 text-sm font-medium text-primary">{eyebrow}</p> : null}
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
        {children ? <div className="mt-3 text-base leading-relaxed text-muted-foreground text-pretty">{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "ok" | "bad" | "warn" }) {
  const toneClass = tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-foreground";
  return (
    <div className="min-w-0 rounded-lg border bg-background p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-xl font-semibold tabular ${toneClass}`}>{value}</dd>
      {hint ? <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

/** A section on the page canvas. */
export function SectionTitle({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={cn("text-xl font-semibold tracking-tight text-balance", className)}>
      {children}
    </h2>
  );
}

/** The title inside a bordered card. */
export function CardTitle({ children, id, as: Tag = "h2", className }: { children: ReactNode; id?: string; as?: "h2" | "h3"; className?: string }) {
  return (
    <Tag id={id} className={cn("text-base font-semibold text-balance", className)}>
      {children}
    </Tag>
  );
}
