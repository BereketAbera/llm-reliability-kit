"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Dialog } from "radix-ui";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { NAV_LINKS } from "./nav-links";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:gap-6">
        <Link href="/" className="flex items-center gap-1.5 rounded-md font-semibold tracking-tight">
          {/* -ml-1 lines the bars up with the page's left edge; the mark's grid has a 4-unit margin. */}
          <BrandMark className="-ml-1 size-8 shrink-0" />
          <span>Coach reliability kit</span>
        </Link>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={pathname === link.href ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    pathname === link.href && "bg-muted text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <span className="hidden rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground xl:inline-block">Simulated provider: no real model calls</span>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-4" aria-hidden />
              Menu
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
            <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(20rem,88vw)] flex-col gap-4 border-l bg-background p-4 shadow-xl data-[state=open]:animate-in data-[state=open]:slide-in-from-right motion-reduce:animate-none">
              <div className="flex items-center justify-between">
                <Dialog.Title className="font-semibold">Pages</Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted" aria-label="Close menu">
                    <X className="size-4" aria-hidden />
                  </button>
                </Dialog.Close>
              </div>
              <Dialog.Description className="sr-only">Go to a page of the demo.</Dialog.Description>
              <nav aria-label="Main">
                <ul className="space-y-1">
                  {[{ href: "/", label: "Overview" }, ...NAV_LINKS, { href: "/handover", label: "Handover notes" }].map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        aria-current={pathname === link.href ? "page" : undefined}
                        className={cn("flex h-11 items-center rounded-md px-3 text-base font-medium hover:bg-muted", pathname === link.href && "bg-muted")}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <p className="mt-auto rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Simulated provider: no real model calls. Fictional data.</p>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </header>
  );
}
