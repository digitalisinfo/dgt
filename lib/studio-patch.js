import { clampImageSeconds, isUuid, newSlot, normalizeSlot } from "@/lib/studio-plan";
import { deleteStoredFile } from "@/lib/studio-store";

function keepRuntime(prev) {
  return {
    status: prev?.status || "idle",
    error: prev?.error || "",
    outputFileId: prev?.outputFileId || null,
    outputRemoteUrl: prev?.outputRemoteUrl || null,
    outputRemoteExpiresAt: prev?.outputRemoteExpiresAt || null,
    outputDurationSec: prev?.outputDurationSec ?? null,
    predictionId: prev?.predictionId || null,
    fingerprint: prev?.fingerprint || null,
    startedAt: prev?.startedAt || null,
  };
}

export async function applyCreativePatch(existing, body) {
  const name = String(body?.name || existing.name || "Novo criativo").trim().slice(0, 80) || "Novo criativo";
  const assets = existing.assets || [];
  const incomingSlots = Array.isArray(body?.slots) ? body.slots.slice(0, 4) : existing.slots;
  const seen = new Set();
  const slots = [];

  for (let index = 0; index < incomingSlots.length; index++) {
    const incoming = incomingSlots[index] || {};
    const id = isUuid(incoming.id) ? incoming.id : crypto.randomUUID();
    if (seen.has(id)) continue;
    seen.add(id);
    const prev = (existing.slots || []).find((slot) => slot.id === id);
    const norm = normalizeSlot(incoming, slots.length);
    norm.imageIds = norm.imageIds.filter((assetId) =>
      assets.some((asset) => asset.id === assetId && asset.kind === "image")
    );
    norm.extraVideoIds = norm.extraVideoIds.filter((assetId) =>
      assets.some((asset) => asset.id === assetId && asset.kind === "video")
    );
    slots.push({
      ...(prev || newSlot(slots.length)),
      ...norm,
      id,
      ...keepRuntime(prev),
    });
  }

  if (!slots.length) slots.push(newSlot(0));

  const removed = (existing.slots || []).filter((slot) => !slots.some((item) => item.id === slot.id));
  for (const slot of removed) {
    if (slot.outputFileId) await deleteStoredFile(slot.outputFileId);
  }

  const timeline = [];
  for (const item of Array.isArray(body?.timeline) ? body.timeline : []) {
    if (item?.type === "slot" && slots.some((slot) => slot.id === item.id)) {
      timeline.push({ type: "slot", id: item.id });
      continue;
    }
    if (item?.type !== "asset") continue;
    const asset = assets.find((entry) => entry.id === item.id);
    if (!asset) continue;
    if (asset.kind === "image") {
      timeline.push({ type: "asset", id: asset.id, durationSec: clampImageSeconds(item.durationSec) });
    } else if (asset.kind === "video") {
      timeline.push({ type: "asset", id: asset.id });
    }
  }

  return {
    ...existing,
    name,
    assets,
    slots,
    timeline,
    finalFileId: existing.finalFileId || null,
    finalFingerprint: existing.finalFingerprint || null,
  };
}

export function clearSlotOutput(slot) {
  return {
    ...slot,
    status: "idle",
    error: "",
    outputFileId: null,
    outputRemoteUrl: null,
    outputRemoteExpiresAt: null,
    outputDurationSec: null,
    predictionId: null,
    fingerprint: null,
    startedAt: null,
  };
}
