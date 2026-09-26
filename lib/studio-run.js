import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { generateErrors, slotFingerprint } from "@/lib/studio-plan";
import { uploadToReplicate } from "@/lib/replicate-seedance";
import { readStoredBuffer, storedFilePath } from "@/lib/studio-store";
import { extractWav, probeMedia } from "@/lib/video-assemble";

function cacheFresh(url, expiresAt) {
  if (!url || !expiresAt) return false;
  const time = new Date(expiresAt).getTime();
  return Number.isFinite(time) && time - Date.now() > 5 * 60 * 1000;
}

async function uploadStored(id, filename, mime) {
  const stored = await readStoredBuffer(id);
  if (!stored) throw new Error("Arquivo de referência não encontrado. Envie de novo.");
  const bytes = new Uint8Array(stored.buffer);
  return uploadToReplicate(bytes, filename, mime || stored.meta.mime);
}

export async function replicateUrlForAsset(creative, assetId) {
  const asset = (creative.assets || []).find((item) => item.id === assetId);
  if (!asset) throw new Error("Asset não encontrado.");
  if (cacheFresh(asset.replicateUrl, asset.replicateExpiresAt)) return asset.replicateUrl;
  const uploaded = await uploadStored(asset.id, asset.name, asset.mime);
  asset.replicateUrl = uploaded.url;
  asset.replicateExpiresAt = uploaded.expiresAt;
  return uploaded.url;
}

export async function replicateUrlForSlotVideo(creative, slotId) {
  const slot = (creative.slots || []).find((item) => item.id === slotId);
  if (!slot?.outputFileId) throw new Error("O vídeo de referência ainda não foi salvo.");
  if (cacheFresh(slot.outputRemoteUrl, slot.outputRemoteExpiresAt)) return slot.outputRemoteUrl;
  const uploaded = await uploadStored(slot.outputFileId, `slot-${slot.id}.mp4`, "video/mp4");
  slot.outputRemoteUrl = uploaded.url;
  slot.outputRemoteExpiresAt = uploaded.expiresAt;
  return uploaded.url;
}

export async function replicateUrlForAudio(creative, item) {
  const sourceId =
    item.kind === "slot"
      ? creative.slots.find((slot) => slot.id === item.id)?.outputFileId
      : item.id;
  if (!sourceId) throw new Error("Não achei o vídeo de onde extrair a voz.");
  const stored = await readStoredBuffer(sourceId);
  if (!stored) throw new Error("Não achei o vídeo de onde extrair a voz.");
  const mediaPath = storedFilePath(stored.meta);
  const probed = await probeMedia(mediaPath);
  if (!probed.hasAudio) throw new Error("Esse vídeo não tem faixa de áudio para usar como voz.");

  const wavPath = path.join(os.tmpdir(), `studio-audio-${randomUUID()}.wav`);
  try {
    await extractWav(mediaPath, wavPath);
    const buffer = await fs.readFile(wavPath);
    const uploaded = await uploadToReplicate(new Uint8Array(buffer), "referencia.wav", "audio/wav");
    return uploaded.url;
  } finally {
    await fs.rm(wavPath, { force: true });
  }
}

export async function buildSeedanceInput(creative, index) {
  const slot = creative.slots[index];
  const { plan, errors } = generateErrors(slot, index, creative.slots, creative.assets || []);
  if (errors.length) {
    const error = new Error(errors[0]);
    error.errors = errors;
    throw error;
  }

  const imageUrls = [];
  for (const item of plan.images) imageUrls.push(await replicateUrlForAsset(creative, item.id));

  const videoUrls = [];
  for (const item of plan.videos) {
    if (item.kind === "slot") videoUrls.push(await replicateUrlForSlotVideo(creative, item.id));
    else videoUrls.push(await replicateUrlForAsset(creative, item.id));
  }

  const audioUrls = [];
  for (const item of plan.audios) audioUrls.push(await replicateUrlForAudio(creative, item));

  const input = {
    prompt: plan.norm.prompt.trim(),
    duration: plan.norm.duration,
    resolution: plan.norm.resolution,
    aspect_ratio: "9:16",
    generate_audio: true,
    watermark: false,
    output_format: "mp4",
  };
  if (imageUrls.length) input.reference_images = imageUrls;
  if (videoUrls.length) input.reference_videos = videoUrls;
  if (audioUrls.length) input.reference_audios = audioUrls;

  return { input, fingerprint: slotFingerprint(slot, index) };
}
