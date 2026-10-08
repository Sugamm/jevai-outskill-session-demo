import { logVote, tally, VOTES, type Vote } from "@/lib/calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(tally());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { call_id?: unknown; vote?: unknown } | null;
  if (typeof body?.call_id !== "string" || !VOTES.includes(body.vote as Vote)) {
    return Response.json({ error: "call_id and a valid vote are required." }, { status: 400 });
  }
  logVote(body.call_id, body.vote as Vote);
  return Response.json(tally());
}
