import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/api-guard";
import { replicateConfigured } from "@/lib/replicate-seedance";
import { createCreative, listCreatives, sweepExpired } from "@/lib/studio-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  await sweepExpired();
  const creatives = await listCreatives();
  return NextResponse.json({ creatives, replicateConfigured: replicateConfigured() });
}

export async function POST(request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  try {
    const creative = await createCreative();
    return NextResponse.json({ creative });
  } catch (err) {
    return jsonError(err?.message || "Não consegui criar o criativo.", 500);
  }
}
