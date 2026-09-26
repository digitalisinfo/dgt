import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { stripMetadataArgs } from "@/lib/video-metadata";

export function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg-static não encontrado. Rode npm install."));
      return;
    }

    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg falhou (code ${code}): ${stderr.slice(-1200)}`));
    });
  });
}

/** Extrai áudio estéreo PCM 16-bit 44.1kHz WAV do vídeo. */
export async function extractStereoWav(inputVideo, outputWav) {
  await runFfmpeg([
    "-y",
    "-i",
    inputVideo,
    "-vn",
    "-ac",
    "2",
    "-ar",
    "44100",
    "-acodec",
    "pcm_s16le",
    outputWav,
  ]);
}

/** Remux: vídeo do principal + novo áudio WAV → MP4. */
export async function muxVideoWithWav(inputVideo, inputWav, outputMp4) {
  await runFfmpeg([
    "-y",
    "-i",
    inputVideo,
    "-i",
    inputWav,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    outputMp4,
  ]);
}

/** Remux o vídeo sem reencode, removendo metadados do container. */
export async function stripVideoMetadata(inputVideo, outputVideo, options = {}) {
  await runFfmpeg(["-y", ...stripMetadataArgs(inputVideo, outputVideo, options)]);
}
