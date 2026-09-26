import { createReadStream } from "fs";
import { Readable } from "stream";
import { promises as fs } from "fs";
import { jsonError, requireSession } from "@/lib/api-guard";
import { isUuid } from "@/lib/studio-plan";
import { readFileMeta, safeDownloadName, storedFilePath } from "@/lib/studio-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return jsonError("Arquivo inválido.", 404);
  const meta = await readFileMeta(id);
  if (!meta) return jsonError("Arquivo não encontrado.", 404);

  const filePath = storedFilePath(meta);
  let size = 0;
  try {
    size = (await fs.stat(filePath)).size;
  } catch {
    return jsonError("Arquivo não encontrado.", 404);
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = safeDownloadName(meta.originalName, meta.ext);
  const headers = {
    "Content-Type": meta.mime || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
  };

  const range = request.headers.get("range");
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (!match) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    const stream = createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(stream), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const stream = createReadStream(filePath);
  return new Response(Readable.toWeb(stream), {
    headers: { ...headers, "Content-Length": String(size) },
  });
}
