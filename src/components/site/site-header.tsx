"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "./nav-links";

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="z-40 border-b bg-background lg:sticky lg:top-0">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 rounded-md font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-4.5" aria-hidden />
            </span>
            <span>Coach reliability kit</span>
          </Link>
          <span className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground lg:hidden">Simulated provider</span>
        </div>
        <nav aria-label="Main">
          <ul className="-mx-2 flex flex-wrap items-center gap-x-1 gap-y-0.5 lg:mx-0">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-9 items-center rounded-md px-2.5 text-sm font-medium sm:px-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      active && "bg-muted text-foreground",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <span className="hidden rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground lg:inline-block">
          Simulated provider: no real model calls
        </span>
      </div>
    </header>
  );
}
