import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/api-guard";
import { applyCreativePatch } from "@/lib/studio-patch";
import { clampImageSeconds, isUuid, timelineFingerprint } from "@/lib/studio-plan";
import {
  deleteStoredFile,
  readCreative,
  readFileMeta,
  saveBufferFile,
  storedFilePath,
  withCreativeLock,
  writeCreative,
} from "@/lib/studio-store";
import { assembleSegments, probeMedia } from "@/lib/video-assemble";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request) {
  const denied = await requireSession(request);
  if (denied) return denied;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("JSON inválido.");
  }

  const creativeId = String(body.creativeId || "");
  if (!isUuid(creativeId)) return jsonError("Criativo inválido.");

  const prepared = await withCreativeLock(creativeId, async () => {
    const existing = await readCreative(creativeId);
    if (!existing) return null;
    const next = await applyCreativePatch(existing, {
      name: existing.name,
      slots: existing.slots,
      timeline: Array.isArray(body.timeline) ? body.timeline : existing.timeline,
    });
    return writeCreative(next);
  });

  if (!prepared) return jsonError("Criativo não encontrado.", 404);
  if (!prepared.timeline?.length) return jsonError("Monte a timeline antes de juntar o vídeo.");

  const segments = [];
  try {
    for (const item of prepared.timeline) {
      if (item.type === "slot") {
        const index = prepared.slots.findIndex((slot) => slot.id === item.id);
        const slot = prepared.slots[index];
        if (!slot?.outputFileId || slot.status !== "ready") {
          return jsonError(`O Slot ${index + 1} ainda não está pronto.`);
        }
        const fileMeta = await readFileMeta(slot.outputFileId);
        if (!fileMeta) return jsonError(`O vídeo do Slot ${index + 1} não está mais no disco.`);
        const mediaPath = storedFilePath(fileMeta);
        const probed = await probeMedia(mediaPath);
        segments.push({
          path: mediaPath,
          kind: "video",
          hasAudio: probed.hasAudio,
          durationSec: probed.durationSec || slot.duration,
        });
        continue;
      }

      const asset = (prepared.assets || []).find((entry) => entry.id === item.id);
      if (!asset) return jsonError("Um asset da timeline não existe mais.");
      const fileMeta = await readFileMeta(asset.id);
      if (!fileMeta) return jsonError(`O arquivo "${asset.name}" não está mais no disco.`);
      const mediaPath = storedFilePath(fileMeta);
      if (asset.kind === "image") {
        segments.push({
          path: mediaPath,
          kind: "image",
          hasAudio: false,
          durationSec: clampImageSeconds(item.durationSec),
        });
        continue;
      }
      const probed = await probeMedia(mediaPath);
      segments.push({
        path: mediaPath,
        kind: "video",
        hasAudio: probed.hasAudio,
        durationSec: probed.durationSec || asset.durationSec || 1,
      });
    }

    const tempOut = path.join(os.tmpdir(), `studio-final-${randomUUID()}.mp4`);
    let meta;
    try {
      await assembleSegments(segments, tempOut);
      const buffer = await fs.readFile(tempOut);
      meta = await saveBufferFile({
        buffer,
        originalName: `${prepared.name || "criativo"}.mp4`,
        mime: "video/mp4",
        kind: "video",
      });
    } finally {
      await fs.rm(tempOut, { force: true });
    }

    const probedFinal = await probeMedia(storedFilePath(meta)).catch(() => ({ durationSec: null }));
    const fingerprint = timelineFingerprint(prepared.timeline);
    const creative = await withCreativeLock(creativeId, async () => {
      const latest = await readCreative(creativeId);
      if (!latest) return null;
      if (latest.finalFileId && latest.finalFileId !== meta.id) {
        await deleteStoredFile(latest.finalFileId);
      }
      latest.finalFileId = meta.id;
      latest.finalFingerprint = fingerprint;
      return writeCreative(latest);
    });

    if (!creative) return jsonError("Criativo não encontrado.", 404);
    return NextResponse.json({
      creative,
      durationSec: probedFinal.durationSec,
    });
  } catch (err) {
    console.error("[studio/assemble]", err);
    return jsonError(err?.message || "Não consegui montar o vídeo.", 500);
  }
}
