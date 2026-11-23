"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The "On this page" list: highlights the section in view on wide screens, and
 * becomes a sticky "Jump to section" picker on phones.
 */
export function OnThisPage({ items }: { items: ReadonlyArray<readonly [string, string]> }) {
  const [active, setActive] = useState<string>(items[0]?.[0] ?? "");

  useEffect(() => {
    const sections = items.map(([id]) => document.getElementById(id)).filter((node): node is HTMLElement => node !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);

  return (
    <>
      <div className="sticky top-[57px] z-30 -mx-4 border-b bg-canvas/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
        <label htmlFor="jump" className="sr-only">
          Jump to section
        </label>
        <select
          id="jump"
          value={active}
          onChange={(event) => {
            setActive(event.target.value);
            document.getElementById(event.target.value)?.scrollIntoView({ block: "start" });
          }}
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        >
          {items.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <nav aria-label="On this page" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">On this page</p>
        <ol className="space-y-1 border-l text-sm">
          {items.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={active === id ? "location" : undefined}
                className={cn(
                  "-ml-px block border-l-2 py-1 pl-3 underline-offset-4 hover:text-foreground hover:underline",
                  active === id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground",
                )}
              >
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
