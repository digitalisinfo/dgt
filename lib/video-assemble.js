import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import { runFfmpeg } from "@/lib/ffmpeg";

const SCALE =
  "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p,setsar=1";

export function probeMedia(filePath) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg-static não encontrado. Rode npm install."));
      return;
    }
    const proc = spawn(ffmpegPath, ["-hide_banner", "-i", filePath], { windowsHide: true });
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error("Demorou para ler a duração do arquivo."));
    }, 20000);
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      const durationSec = match
        ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
        : null;
      resolve({
        durationSec: Number.isFinite(durationSec) ? durationSec : null,
        hasAudio: /Audio:/.test(stderr),
        hasVideo: /Video:/.test(stderr),
      });
    });
  });
}

export async function extractWav(inputPath, outputPath) {
  await runFfmpeg([
    "-nostdin",
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "44100",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);
}

async function normalizeSegment(segment, outputPath) {
  const duration = String(segment.durationSec || 3);
  if (segment.kind === "image") {
    await runFfmpeg([
      "-nostdin",
      "-y",
      "-loop",
      "1",
      "-framerate",
      "30",
      "-t",
      duration,
      "-i",
      segment.path,
      "-f",
      "lavfi",
      "-t",
      duration,
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-vf",
      SCALE,
      "-t",
      duration,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    return;
  }

  if (segment.hasAudio) {
    await runFfmpeg([
      "-nostdin",
      "-y",
      "-i",
      segment.path,
      "-vf",
      SCALE,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    return;
  }

  await runFfmpeg([
    "-nostdin",
    "-y",
    "-i",
    segment.path,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-vf",
    SCALE,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

function concatLine(filePath) {
  const normalized = filePath.replace(/\\/g, "/").replace(/'/g, "'\\''");
  return `file '${normalized}'`;
}

export async function assembleSegments(segments, outputPath) {
  if (!segments.length) throw new Error("A timeline está vazia.");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "studio-assemble-"));
  try {
    const normalized = [];
    for (let i = 0; i < segments.length; i++) {
      const target = path.join(dir, `seg-${i}.mp4`);
      await normalizeSegment(segments[i], target);
      normalized.push(target);
    }
    const listPath = path.join(dir, "list.txt");
    await fs.writeFile(listPath, normalized.map(concatLine).join("\n"));
    await runFfmpeg([
      "-nostdin",
      "-y",
      "-fflags",
      "+genpts",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
