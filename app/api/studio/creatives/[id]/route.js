import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/api-guard";
import { isUuid } from "@/lib/studio-plan";
import { applyCreativePatch } from "@/lib/studio-patch";
import { deleteCreative, readCreative, sweepExpired, withCreativeLock, writeCreative } from "@/lib/studio-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readId(params) {
  const { id } = await params;
  return id;
}

export async function GET(request, { params }) {
  const denied = await requireSession(request);
  if (denied) return denied;
  const id = await readId(params);
  if (!isUuid(id)) return jsonError("Criativo inválido.");
  const creative = await readCreative(id);
  if (!creative) return jsonError("Criativo não encontrado.", 404);
  return NextResponse.json({ creative });
}

export async function PUT(request, { params }) {
  const denied = await requireSession(request);
  if (denied) return denied;
  const id = await readId(params);
  if (!isUuid(id)) return jsonError("Criativo inválido.");
  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("JSON inválido.");
  }

  try {
    const creative = await withCreativeLock(id, async () => {
      const existing = await readCreative(id);
      if (!existing) return null;
      const next = await applyCreativePatch(existing, body);
      return writeCreative(next);
    });
    if (!creative) return jsonError("Criativo não encontrado.", 404);
    return NextResponse.json({ creative });
  } catch (err) {
    return jsonError(err?.message || "Não consegui salvar.", 500);
  }
}

export async function DELETE(request, { params }) {
  const denied = await requireSession(request);
  if (denied) return denied;
  const id = await readId(params);
  if (!isUuid(id)) return jsonError("Criativo inválido.");
  await sweepExpired();
  await withCreativeLock(id, async () => {
    await deleteCreative(id);
  });
  return NextResponse.json({ ok: true });
}
