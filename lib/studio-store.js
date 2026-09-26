import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { isUuid, newSlot } from "@/lib/studio-plan";

const ROOT = path.join(process.cwd(), "data", "studio");
const CREATIVES = path.join(ROOT, "creatives");
const FILES = path.join(ROOT, "files");
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const tails = new Map();

export function withCreativeLock(id, fn) {
  const prev = tails.get(id) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const settled = run.then(
    () => {},
    () => {}
  );
  tails.set(id, settled);
  settled.then(() => {
    if (tails.get(id) === settled) tails.delete(id);
  });
  return run;
}

async function ensure() {
  await fs.mkdir(CREATIVES, { recursive: true });
  await fs.mkdir(FILES, { recursive: true });
}

function creativePath(id) {
  if (!isUuid(id)) throw new Error("Criativo inválido.");
  return path.join(CREATIVES, `${id}.json`);
}

export async function readCreative(id) {
  try {
    const raw = await fs.readFile(creativePath(id), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeCreative(creative) {
  await ensure();
  const next = { ...creative, updatedAt: new Date().toISOString() };
  await fs.writeFile(creativePath(next.id), JSON.stringify(next, null, 2));
  return next;
}

export async function listCreatives() {
  await ensure();
  const names = await fs.readdir(CREATIVES);
  const items = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const creative = JSON.parse(await fs.readFile(path.join(CREATIVES, name), "utf8"));
      items.push({
        id: creative.id,
        name: creative.name,
        updatedAt: creative.updatedAt,
        slotCount: creative.slots?.length || 0,
      });
    } catch {
      /* ignora json corrompido */
    }
  }
  items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return items;
}

export async function createCreative() {
  await ensure();
  const now = new Date().toISOString();
  const creative = {
    id: randomUUID(),
    name: "Novo criativo",
    createdAt: now,
    updatedAt: now,
    assets: [],
    slots: [newSlot(0)],
    timeline: [],
    finalFileId: null,
    finalFingerprint: null,
  };
  await fs.writeFile(creativePath(creative.id), JSON.stringify(creative, null, 2));
  return creative;
}

function referencedFileIds(creative) {
  const ids = new Set();
  for (const asset of creative.assets || []) ids.add(asset.id);
  for (const slot of creative.slots || []) {
    if (slot.outputFileId) ids.add(slot.outputFileId);
  }
  if (creative.finalFileId) ids.add(creative.finalFileId);
  return ids;
}

export async function deleteStoredFile(id) {
  if (!isUuid(id)) return;
  const meta = await readFileMeta(id);
  await fs.rm(path.join(FILES, `${id}.json`), { force: true });
  if (meta?.ext) await fs.rm(path.join(FILES, `${id}${meta.ext}`), { force: true });
}

export async function deleteCreative(id) {
  const creative = await readCreative(id);
  if (!creative) return;
  for (const fileId of referencedFileIds(creative)) {
    await deleteStoredFile(fileId);
  }
  await fs.rm(creativePath(id), { force: true });
}

export async function sweepExpired() {
  await ensure();
  const names = await fs.readdir(CREATIVES);
  const now = Date.now();
  const keep = new Set();

  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    let creative;
    try {
      creative = JSON.parse(await fs.readFile(path.join(CREATIVES, name), "utf8"));
    } catch {
      continue;
    }
    const updated = new Date(creative.updatedAt || creative.createdAt || 0).getTime();
    if (!updated || now - updated > MAX_AGE_MS) {
      await deleteCreative(creative.id);
      continue;
    }
    for (const fileId of referencedFileIds(creative)) keep.add(fileId);
  }

  const files = await fs.readdir(FILES);
  for (const name of files) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    if (!isUuid(id) || keep.has(id)) continue;
    try {
      const meta = JSON.parse(await fs.readFile(path.join(FILES, name), "utf8"));
      const created = new Date(meta.createdAt || 0).getTime();
      if (created && now - created > MAX_AGE_MS) await deleteStoredFile(id);
    } catch {
      /* ignore */
    }
  }
}

const EXT_BY_MIME = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "audio/wav": ".wav",
  "audio/wave": ".wav",
  "audio/x-wav": ".wav",
};

export function extForUpload(filename, mime) {
  const fromMime = EXT_BY_MIME[mime];
  if (fromMime) return fromMime;
  const match = String(filename || "").toLowerCase().match(/\.(mp4|mov|png|jpe?g|webp|wav)$/);
  if (!match) return "";
  if (match[1] === "jpeg" || match[1] === "jpg") return ".jpg";
  return `.${match[1]}`;
}

export function kindForExt(ext) {
  if (ext === ".png" || ext === ".jpg" || ext === ".webp") return "image";
  if (ext === ".mp4" || ext === ".mov") return "video";
  if (ext === ".wav") return "audio";
  return "";
}

export async function saveBufferFile({ buffer, originalName, mime, kind, durationSec }) {
  await ensure();
  const ext = extForUpload(originalName, mime);
  const resolvedKind = kind || kindForExt(ext);
  if (!ext || !resolvedKind) throw new Error("Formato não suportado.");
  const id = randomUUID();
  await fs.writeFile(path.join(FILES, `${id}${ext}`), buffer);
  const meta = {
    id,
    ext,
    originalName: String(originalName || `arquivo${ext}`).slice(0, 180),
    mime: mime || "application/octet-stream",
    kind: resolvedKind,
    bytes: buffer.length,
    durationSec: durationSec ?? null,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(FILES, `${id}.json`), JSON.stringify(meta));
  return meta;
}

export function safeDownloadName(name, ext) {
  const base =
    String(name || "video")
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .slice(0, 80) || "video";
  return `${base}${ext || ""}`;
}

export async function updateFileMeta(id, patch) {
  const meta = await readFileMeta(id);
  if (!meta) return null;
  const next = { ...meta, ...patch, id: meta.id, ext: meta.ext };
  await fs.writeFile(path.join(FILES, `${id}.json`), JSON.stringify(next));
  return next;
}

export async function readFileMeta(id) {
  if (!isUuid(id)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(FILES, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

export function storedFilePath(meta) {
  if (!meta?.id || !meta?.ext) return "";
  return path.join(FILES, `${meta.id}${meta.ext}`);
}

export async function readStoredBuffer(id) {
  const meta = await readFileMeta(id);
  if (!meta) return null;
  const buffer = await fs.readFile(storedFilePath(meta));
  return { meta, buffer };
}
