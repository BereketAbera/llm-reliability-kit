import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Sample by Bereket A. · fictional data</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/handover" className="font-medium text-primary underline-offset-4 hover:underline">
            Handover notes
          </Link>
          <span>The Clear Next Step method is fictional. Simulated provider: no real model calls.</span>
        </p>
      </div>
    </footer>
  );
}
