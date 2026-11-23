"use client";

import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Any page that throws in the browser lands here instead of a blank screen. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="max-w-xl py-8" role="alert">
      <p className="mb-2 text-sm font-medium text-primary">Something broke</p>
      <h1 className="text-3xl font-semibold tracking-tight">This page hit an error</h1>
      <p className="mt-3 text-muted-foreground">Nothing you did is lost. Try loading the page again, or go back to the overview.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button size="lg" onClick={reset}>
          <RotateCw aria-hidden /> Try again
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/">Back to the overview</Link>
        </Button>
      </div>
    </div>
  );
}
