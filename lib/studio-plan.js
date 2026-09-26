export const PRICE_720_PER_SEC = 0.23;
export const MAX_SLOTS = 4;
export const MIN_DURATION = 5;
export const MAX_DURATION = 30;
export const MAX_REF_SECONDS = 30;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function uniqueIds(list) {
  const out = [];
  const seen = new Set();
  for (const id of Array.isArray(list) ? list : []) {
    if (!isUuid(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function clampDuration(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 15;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, n));
}

export function clampImageSeconds(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 3;
  return Math.min(15, Math.max(1, n));
}

export function newSlot(index = 0) {
  const first = index === 0;
  return {
    id: crypto.randomUUID(),
    prompt: "",
    duration: 15,
    resolution: "720p",
    imageIds: [],
    extraVideoIds: [],
    videoRef: first ? "none" : "auto",
    audioRef: first ? "none" : "auto",
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

export function normalizeSlot(slot, index) {
  let videoRef = slot?.videoRef || (index === 0 ? "none" : "auto");
  let audioRef = slot?.audioRef || (index === 0 ? "none" : "auto");
  if (index === 0) {
    if (videoRef === "auto") videoRef = "none";
    if (audioRef === "auto") audioRef = "none";
  }
  return {
    prompt: String(slot?.prompt || "").slice(0, 8000),
    duration: clampDuration(slot?.duration),
    resolution: slot?.resolution === "480p" ? "480p" : "720p",
    imageIds: uniqueIds(slot?.imageIds),
    extraVideoIds: uniqueIds(slot?.extraVideoIds),
    videoRef,
    audioRef,
  };
}

export function slotFingerprint(slot, index) {
  return JSON.stringify(normalizeSlot(slot, index));
}

export function timelineFingerprint(timeline) {
  const items = (Array.isArray(timeline) ? timeline : []).map((item) => {
    if (item?.type === "asset" && item.durationSec != null) {
      return { type: "asset", id: item.id, durationSec: clampImageSeconds(item.durationSec) };
    }
    return { type: item?.type, id: item?.id };
  });
  return JSON.stringify(items);
}

function slotLabel(slots, id) {
  const index = slots.findIndex((slot) => slot.id === id);
  return index >= 0 ? `Slot ${index + 1}` : "Slot";
}

function resolveChoice(ref, index, slots, assets, media) {
  const choice = !ref || ref === "auto" ? (index === 0 ? "none" : "auto") : ref;
  if (choice === "none") return { item: null, pending: false, missing: false };

  if (choice === "auto") {
    const prev = slots[index - 1];
    if (!prev?.outputFileId) return { item: null, pending: true, missing: false };
    return {
      pending: false,
      missing: false,
      item: {
        kind: "slot",
        id: prev.id,
        name: `Saída do ${slotLabel(slots, prev.id)}`,
        durationSec: Number(prev.outputDurationSec || prev.duration) || null,
        media,
      },
    };
  }

  if (choice.startsWith("slot:")) {
    const id = choice.slice(5);
    const found = slots.find((slot) => slot.id === id);
    if (!found?.outputFileId) return { item: null, pending: false, missing: true };
    return {
      pending: false,
      missing: false,
      item: {
        kind: "slot",
        id: found.id,
        name: `Saída do ${slotLabel(slots, found.id)}`,
        durationSec: Number(found.outputDurationSec || found.duration) || null,
        media,
      },
    };
  }

  if (choice.startsWith("asset:")) {
    const id = choice.slice(6);
    const asset = assets.find((item) => item.id === id && item.kind === "video");
    if (!asset) return { item: null, pending: false, missing: true };
    return {
      pending: false,
      missing: false,
      item: {
        kind: "asset",
        id: asset.id,
        name: asset.name,
        durationSec: Number(asset.durationSec) || null,
        media,
      },
    };
  }

  return { item: null, pending: false, missing: true };
}

function sumKnown(items) {
  const known = items.every((item) => typeof item.durationSec === "number" && item.durationSec > 0);
  const sum = items.reduce((total, item) => total + (item.durationSec || 0), 0);
  return { known, sum };
}

export function planSlotReferences(slot, index, slots, assets) {
  const norm = normalizeSlot(slot, index);
  const blockers = [];
  const hints = [];
  const images = [];

  for (const id of norm.imageIds) {
    const asset = assets.find((item) => item.id === id && item.kind === "image");
    if (!asset) continue;
    images.push({ kind: "asset", id: asset.id, name: asset.name, media: "image" });
  }

  const videoChoice = resolveChoice(norm.videoRef, index, slots, assets, "video");
  const videos = [];
  if (videoChoice.item) videos.push(videoChoice.item);
  if (videoChoice.pending) {
    hints.push("Quando o slot anterior ficar pronto, o vídeo dele entra sozinho como referência de rosto.");
  }
  if (videoChoice.missing) blockers.push("A referência de vídeo escolhida não está disponível.");

  for (const id of norm.extraVideoIds) {
    const asset = assets.find((item) => item.id === id && item.kind === "video");
    if (!asset) continue;
    videos.push({
      kind: "asset",
      id: asset.id,
      name: asset.name,
      durationSec: Number(asset.durationSec) || null,
      media: "video",
    });
  }

  const audioChoice = resolveChoice(norm.audioRef, index, slots, assets, "audio");
  const audios = [];
  if (audioChoice.item) audios.push(audioChoice.item);
  if (audioChoice.pending) {
    hints.push("Quando o slot anterior ficar pronto, o áudio dele entra como referência de voz.");
  }
  if (audioChoice.missing) blockers.push("A referência de áudio escolhida não está disponível.");

  const taggedImages = images.map((item, i) => ({ ...item, tag: `[Image${i + 1}]` }));
  const taggedVideos = videos.map((item, i) => ({ ...item, tag: `[Video${i + 1}]` }));
  const taggedAudios = audios.map((item, i) => ({ ...item, tag: `[Audio${i + 1}]` }));

  const videoSum = sumKnown(taggedVideos);
  if (taggedVideos.length && !videoSum.known) {
    hints.push("Não medi a duração de algum vídeo de referência. O Seedance aceita no máximo 30s somados.");
  }
  if (taggedVideos.length && videoSum.known && videoSum.sum > MAX_REF_SECONDS + 0.05) {
    blockers.push(
      `Os vídeos de referência somam ${videoSum.sum.toFixed(1)}s. O limite do Seedance é 30s no total — deixe o vídeo do app só na timeline, ou encurte os clipes.`
    );
  }

  const audioSum = sumKnown(taggedAudios);
  if (taggedAudios.length && audioSum.known && audioSum.sum > MAX_REF_SECONDS + 0.05) {
    blockers.push(`Os áudios de referência somam ${audioSum.sum.toFixed(1)}s. O limite é 30s.`);
  }

  if (taggedAudios.length && taggedImages.length === 0 && taggedVideos.length === 0 && !audioChoice.pending) {
    blockers.push("Com áudio de referência, o Seedance exige pelo menos uma imagem ou um vídeo junto.");
  }

  return {
    images: taggedImages,
    videos: taggedVideos,
    audios: taggedAudios,
    blockers,
    hints,
    pendingVideo: videoChoice.pending,
    pendingAudio: audioChoice.pending,
    norm,
  };
}

export function generateErrors(slot, index, slots, assets) {
  const plan = planSlotReferences(slot, index, slots, assets);
  const errors = [...plan.blockers];
  if (!plan.norm.prompt.trim()) errors.push("Escreva o prompt deste slot.");
  if (plan.pendingVideo) {
    errors.push("Gere o slot anterior antes de encadear o rosto, ou mude a referência de vídeo para Nenhum.");
  }
  if (plan.pendingAudio) {
    errors.push("Gere o slot anterior antes de encadear a voz, ou mude a referência de áudio para Nenhum.");
  }
  return { plan, errors };
}

export function estimateUsd(slots, fromIndex, toIndex = slots.length) {
  let usd = 0;
  let includes480 = false;
  const end = Math.min(slots.length, toIndex);
  for (let i = fromIndex; i < end; i++) {
    const norm = normalizeSlot(slots[i], i);
    if (norm.resolution === "480p") includes480 = true;
    else usd += norm.duration * PRICE_720_PER_SEC;
  }
  return { usd, includes480 };
}

export function formatUsd(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(value || 0);
}
