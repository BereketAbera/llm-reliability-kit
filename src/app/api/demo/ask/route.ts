import { handleAskPost } from "@/lib/coach/ask-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Demo only: the same SSE answer as POST /api/ask, plus `paraphrase: true` to
 * simulate a model that rewrites retrieved lines, so the page can show the
 * verbatim guard catching it. The guard itself cannot be switched off.
 */
export function POST(request: Request) {
  return handleAskPost(request, true);
}
