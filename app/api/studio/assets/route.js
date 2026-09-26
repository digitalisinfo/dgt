import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/api-guard";
import { isUuid } from "@/lib/studio-plan";
import {
  deleteStoredFile,
  extForUpload,
  kindForExt,
  readCreative,
  saveBufferFile,
  storedFilePath,
  sweepExpired,
  updateFileMeta,
  withCreativeLock,
  writeCreative,
} from "@/lib/studio-store";
import { probeMedia } from "@/lib/video-assemble";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BYTES = 200 * 1024 * 1024;
const MAX_ASSETS = 12;

function mimeForUpload(type, ext, kind) {
  if (type && type !== "application/octet-stream") return type;
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg") return "image/jpeg";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".wav") return "audio/wav";
  return kind === "image" ? "image/jpeg" : "video/mp4";
}

export async function POST(request) {
  const denied = await requireSession(request);
  if (denied) return denied;

  let form;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Não consegui ler o upload.");
  }

  const creativeId = String(form.get("creativeId") || "");
  const file = form.get("file");
  if (!isUuid(creativeId)) return jsonError("Criativo inválido.");
  if (!file || typeof file.arrayBuffer !== "function") return jsonError("Envie um arquivo.");
  if (file.size <= 0) return jsonError("O arquivo está vazio.");
  if (file.size > MAX_BYTES) return jsonError("Arquivo acima de 200 MB.");

  const ext = extForUpload(file.name, file.type);
  const kind = kindForExt(ext);
  if (kind !== "image" && kind !== "video") {
    return jsonError("Use MP4, MOV, PNG, JPG ou WebP.");
  }

  try {
    const creative = await withCreativeLock(creativeId, async () => {
      const existing = await readCreative(creativeId);
      if (!existing) return null;
      if ((existing.assets || []).length >= MAX_ASSETS) {
        const error = new Error(`No máximo ${MAX_ASSETS} assets por criativo.`);
        error.status = 400;
        throw error;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const mime = mimeForUpload(file.type, ext, kind);
      const meta = await saveBufferFile({
        buffer,
        originalName: file.name,
        mime,
        kind,
        durationSec: null,
      });

      if (kind === "video") {
        try {
          const probed = await probeMedia(storedFilePath(meta));
          if (probed.durationSec) {
            meta.durationSec = Math.round(probed.durationSec * 10) / 10;
            await updateFileMeta(meta.id, { durationSec: meta.durationSec });
          }
        } catch {
          /* a duração segue desconhecida e a UI avisa */
        }
      }

      existing.assets = [
        ...(existing.assets || []),
        {
          id: meta.id,
          name: meta.originalName,
          kind: meta.kind,
          mime: meta.mime,
          bytes: meta.bytes,
          durationSec: meta.durationSec,
          replicateUrl: null,
          replicateExpiresAt: null,
        },
      ];
      return writeCreative(existing);
    });

    if (!creative) return jsonError("Criativo não encontrado.", 404);
    return NextResponse.json({ creative });
  } catch (err) {
    return jsonError(err?.message || "Falha no upload.", err?.status || 500);
  }
}

export async function DELETE(request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  await sweepExpired();

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("JSON inválido.");
  }

  const creativeId = String(body.creativeId || "");
  const assetId = String(body.assetId || "");
  if (!isUuid(creativeId) || !isUuid(assetId)) return jsonError("Arquivo inválido.");

  try {
    const creative = await withCreativeLock(creativeId, async () => {
      const existing = await readCreative(creativeId);
      if (!existing) return null;
      const asset = (existing.assets || []).find((item) => item.id === assetId);
      if (!asset) return existing;

      existing.assets = existing.assets.filter((item) => item.id !== assetId);
      existing.slots = (existing.slots || []).map((slot) => ({
        ...slot,
        imageIds: (slot.imageIds || []).filter((id) => id !== assetId),
        extraVideoIds: (slot.extraVideoIds || []).filter((id) => id !== assetId),
        videoRef: slot.videoRef === `asset:${assetId}` ? "auto" : slot.videoRef,
        audioRef: slot.audioRef === `asset:${assetId}` ? "auto" : slot.audioRef,
      }));
      existing.timeline = (existing.timeline || []).filter(
        (item) => !(item.type === "asset" && item.id === assetId)
      );
      await deleteStoredFile(assetId);
      const saved = await writeCreative(existing);
      return saved;
    });
    if (!creative) return jsonError("Criativo não encontrado.", 404);
    return NextResponse.json({ creative });
  } catch (err) {
    return jsonError(err?.message || "Não consegui remover o asset.", 500);
  }
}
