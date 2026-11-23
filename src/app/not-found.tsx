import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/site/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="py-8">
      <PageHeader eyebrow="404" title="This page does not exist">
        <p>The link may be old, or the address has a typo. Everything in the demo is one click away from here.</p>
      </PageHeader>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/ask">
            Ask the coach <ArrowRight aria-hidden />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/burst">See the 429 fix</Link>
        </Button>
        <Button asChild size="lg" variant="ghost">
          <Link href="/">Back to the overview</Link>
        </Button>
      </div>
    </div>
  );
}
