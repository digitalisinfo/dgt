import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/api-guard";
import {
  createSeedancePrediction,
  downloadRemote,
  getPrediction,
  predictionOutputUrl,
} from "@/lib/replicate-seedance";
import { isUuid, slotFingerprint } from "@/lib/studio-plan";
import { clearSlotOutput } from "@/lib/studio-patch";
import { buildSeedanceInput } from "@/lib/studio-run";
import {
  deleteStoredFile,
  readCreative,
  readFileMeta,
  saveBufferFile,
  storedFilePath,
  updateFileMeta,
  withCreativeLock,
  writeCreative,
} from "@/lib/studio-store";
import { probeMedia } from "@/lib/video-assemble";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function terminalError(prediction) {
  if (typeof prediction?.error === "string" && prediction.error.trim()) return prediction.error;
  if (prediction?.status === "canceled") return "Geração cancelada. O Replicate pode cobrar mesmo assim.";
  return "A geração falhou no Seedance.";
}

async function rememberOutput(slot, creativeName, index, remoteUrl) {
  const buffer = await downloadRemote(remoteUrl);
  const meta = await saveBufferFile({
    buffer,
    originalName: `${creativeName || "criativo"}-slot-${index + 1}.mp4`,
    mime: "video/mp4",
    kind: "video",
  });
  let durationSec = slot.duration;
  try {
    const fileMeta = await readFileMeta(meta.id);
    const probed = await probeMedia(storedFilePath(fileMeta));
    if (probed.durationSec) {
      durationSec = Math.round(probed.durationSec * 10) / 10;
      await updateFileMeta(meta.id, { durationSec });
    }
  } catch {
    /* usa a duração pedida */
  }
  return { fileId: meta.id, durationSec };
}

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
  const slotId = String(body.slotId || "");
  if (!isUuid(creativeId) || !isUuid(slotId)) return jsonError("Slot inválido.");

  try {
    const result = await withCreativeLock(creativeId, async () => {
      const existing = await readCreative(creativeId);
      if (!existing) return { missing: true };
      const index = existing.slots.findIndex((slot) => slot.id === slotId);
      if (index < 0) return { missingSlot: true };
      const slot = existing.slots[index];

      if (slot.status === "generating" && slot.predictionId) {
        return { creative: existing, resumed: true };
      }

      let built;
      try {
        built = await buildSeedanceInput(existing, index);
      } catch (err) {
        const saved = await writeCreative(existing);
        return { error: err.message, status: err.errors ? 400 : 502, creative: saved };
      }

      let prediction;
      try {
        prediction = await createSeedancePrediction(built.input);
      } catch (err) {
        existing.slots[index] = {
          ...slot,
          error: err.message,
          status: slot.outputFileId ? slot.status : "error",
        };
        const saved = await writeCreative(existing);
        return { error: err.message, status: 502, creative: saved };
      }

      if (!prediction?.id) {
        return { error: "O Replicate não devolveu o id da geração.", status: 502, creative: existing };
      }

      if (slot.outputFileId) await deleteStoredFile(slot.outputFileId);
      for (let j = index + 1; j < existing.slots.length; j++) {
        const next = existing.slots[j];
        if (next.outputFileId) await deleteStoredFile(next.outputFileId);
        existing.slots[j] = clearSlotOutput(next);
      }
      if (existing.finalFileId) {
        await deleteStoredFile(existing.finalFileId);
        existing.finalFileId = null;
        existing.finalFingerprint = null;
      }

      existing.slots[index] = {
        ...slot,
        status: "generating",
        error: "",
        outputFileId: null,
        outputRemoteUrl: null,
        outputRemoteExpiresAt: null,
        outputDurationSec: null,
        predictionId: prediction.id,
        fingerprint: built.fingerprint || slotFingerprint(slot, index),
        startedAt: new Date().toISOString(),
      };

      const saved = await writeCreative(existing);
      return { creative: saved };
    });

    if (result.missing) return jsonError("Criativo não encontrado.", 404);
    if (result.missingSlot) return jsonError("Slot não encontrado.", 404);
    if (result.error) return jsonError(result.error, result.status || 400, { creative: result.creative });
    return NextResponse.json({ creative: result.creative, resumed: Boolean(result.resumed) });
  } catch (err) {
    console.error("[studio/generate]", err);
    return jsonError(err?.message || "Falha ao iniciar a geração.", 500);
  }
}

export async function GET(request) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const creativeId = url.searchParams.get("creativeId") || "";
  const slotId = url.searchParams.get("slotId") || "";
  if (!isUuid(creativeId) || !isUuid(slotId)) return jsonError("Slot inválido.");

  try {
    const result = await withCreativeLock(creativeId, async () => {
      const existing = await readCreative(creativeId);
      if (!existing) return { missing: true };
      const index = existing.slots.findIndex((slot) => slot.id === slotId);
      if (index < 0) return { missingSlot: true };
      const slot = existing.slots[index];

      if (slot.status !== "generating" || !slot.predictionId) {
        return { creative: existing };
      }

      const prediction = await getPrediction(slot.predictionId);
      const state = prediction?.status;

      if (state === "starting" || state === "processing" || state === "queued") {
        return { creative: existing };
      }

      if (state === "succeeded") {
        if (slot.outputFileId) {
          existing.slots[index] = { ...slot, status: "ready", error: "" };
          return { creative: await writeCreative(existing) };
        }
        const remoteUrl = predictionOutputUrl(prediction);
        if (!remoteUrl) throw new Error("O Seedance terminou sem devolver o vídeo.");
        const savedFile = await rememberOutput(slot, existing.name, index, remoteUrl);
        existing.slots[index] = {
          ...slot,
          status: "ready",
          error: "",
          outputFileId: savedFile.fileId,
          outputRemoteUrl: remoteUrl,
          outputRemoteExpiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          outputDurationSec: savedFile.durationSec,
        };
        return { creative: await writeCreative(existing) };
      }

      existing.slots[index] = {
        ...slot,
        status: "error",
        error: terminalError(prediction),
        predictionId: null,
      };
      return { creative: await writeCreative(existing) };
    });

    if (result.missing) return jsonError("Criativo não encontrado.", 404);
    if (result.missingSlot) return jsonError("Slot não encontrado.", 404);
    return NextResponse.json({ creative: result.creative });
  } catch (err) {
    console.error("[studio/generate:poll]", err);
    const creative = await readCreative(creativeId).catch(() => null);
    return jsonError(err?.message || "Falha ao consultar a geração.", 502, { creative });
  }
}
