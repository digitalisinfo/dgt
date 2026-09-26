"use client";

import { useRef, useState } from "react";
import ToolsNav from "@/components/tools-nav";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { mergeVisibleMonoInvisibleSide } from "@/lib/wav-ms";

function fileExt(file, fallback = "bin") {
  const match = (file?.name || "").match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : fallback;
}

function isAudioFile(file) {
  if (!file) return false;
  if (file.type?.startsWith("audio/")) return true;
  return /\.(mp3|wav|m4a|aac|ogg|flac|wma)$/i.test(file.name || "");
}

function FilePicker({ label, hint, file, onChange, accent, accept, badge }) {
  return (
    <label className="qa-glass rounded-3xl p-6 block cursor-pointer hover:shadow-lg transition group">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[11px] font-bold tracking-widest ${accent}`}>{label}</p>
          <p className="text-slate-500 text-sm mt-1">{hint}</p>
        </div>
        <span className="text-xs font-semibold text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-full whitespace-nowrap">
          {badge}
        </span>
      </div>
      <input
        type="file"
        accept={accept}
        className="mt-4 block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
      {file && (
        <p className="mt-3 text-sm text-slate-700 font-medium truncate">
          {file.name}{" "}
          <span className="text-slate-400 font-normal">
            ({(file.size / (1024 * 1024)).toFixed(1)} MB)
          </span>
        </p>
      )}
    </label>
  );
}

export default function AudioMergePage() {
  const ffmpegRef = useRef(null);
  const [principal, setPrincipal] = useState(null);
  const [invisible, setInvisible] = useState(null);
  const [stereoWidth, setStereoWidth] = useState(1.2);
  const [invisibleGainDb, setInvisibleGainDb] = useState(-22);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  async function ensureFfmpeg() {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current;

    setProgress("Carregando FFmpeg no navegador (1ª vez pode demorar)…");
    const ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => {
      if (message) console.debug("[ffmpeg]", message);
    });
    ffmpeg.on("progress", ({ progress: p }) => {
      if (Number.isFinite(p) && p > 0) {
        setProgress(`Processando… ${Math.min(99, Math.round(p * 100))}%`);
      }
    });

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setProgress("");

    if (!principal || !invisible) {
      setError("Selecione o vídeo principal e o áudio/vídeo invisível.");
      return;
    }

    setBusy(true);
    const invisibleName = `invisible.${fileExt(invisible, isAudioFile(invisible) ? "mp3" : "mp4")}`;
    const tempFiles = ["principal.mp4", invisibleName, "a.wav", "b.wav", "mixed.wav", "out.mp4"];

    try {
      const ffmpeg = await ensureFfmpeg();

      setProgress("Lendo arquivos…");
      await ffmpeg.writeFile("principal.mp4", await fetchFile(principal));
      await ffmpeg.writeFile(invisibleName, await fetchFile(invisible));

      setProgress("Extraindo áudio do vídeo principal…");
      await ffmpeg.exec([
        "-i",
        "principal.mp4",
        "-vn",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-acodec",
        "pcm_s16le",
        "a.wav",
      ]);

      setProgress(
        isAudioFile(invisible)
          ? "Convertendo áudio invisível (MP3/WAV)…"
          : "Extraindo áudio do segundo arquivo…"
      );
      await ffmpeg.exec([
        "-i",
        invisibleName,
        "-vn",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-acodec",
        "pcm_s16le",
        "b.wav",
      ]);

      setProgress("Misturando Mid/Side…");
      const wavA = await ffmpeg.readFile("a.wav");
      const wavB = await ffmpeg.readFile("b.wav");
      const mixed = mergeVisibleMonoInvisibleSide(wavA, wavB, {
        stereoWidth,
        invisibleGainDb,
      });
      await ffmpeg.writeFile("mixed.wav", mixed);

      setProgress("Montando MP4 final…");
      await ffmpeg.exec([
        "-i",
        "principal.mp4",
        "-i",
        "mixed.wav",
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
        "out.mp4",
      ]);

      const out = await ffmpeg.readFile("out.mp4");
      const bytes = out instanceof Uint8Array ? out : new Uint8Array(out);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const base = (principal.name || "video").replace(/\.[^.]+$/, "");
      a.href = url;
      a.download = `${base}-merged.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      for (const f of tempFiles) {
        try {
          await ffmpeg.deleteFile(f);
        } catch {
          /* ignore */
        }
      }

      setProgress("Pronto! O MP4 foi baixado (processado no seu navegador).");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Erro inesperado no processamento.");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 pointer-events-none -z-10 aurora-gradient" />
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="qa-blob qa-blob-a" />
        <div className="qa-blob qa-blob-b" />
        <div className="qa-blob qa-blob-c" />
      </div>
      <div className="fixed inset-0 pointer-events-none -z-10 aurora-grid" />

      <main className="relative min-h-screen px-5 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto">
          <ToolsNav current="/audio" />
          <div className="text-center mb-10">
            <p className="text-[11px] font-bold tracking-widest text-indigo-500 mb-2">
              TOOL · MID / SIDE
            </p>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight">
              Audio Merge
            </h1>
            <p className="text-slate-500 mt-3 max-w-xl mx-auto">
              Envie o <strong className="text-slate-700">vídeo principal (MP4)</strong> e o áudio
              invisível como <strong className="text-slate-700">MP3, WAV ou MP4</strong>. O
              processamento roda no navegador.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <FilePicker
              label="VÍDEO PRINCIPAL"
              hint="Mantém a imagem + áudio visível (o que a pessoa ouve no mono)."
              file={principal}
              onChange={setPrincipal}
              accent="text-indigo-500"
              accept="video/mp4,video/*"
              badge="MP4"
            />

            <FilePicker
              label="ÁUDIO INVISÍVEL"
              hint="Pode ser MP3/WAV (mais leve) ou MP4. Só o áudio é usado; embutido em anti-fase."
              file={invisible}
              onChange={setInvisible}
              accent="text-violet-500"
              accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/*,video/mp4,video/*,.mp3,.wav,.m4a"
              badge="MP3 · WAV · MP4"
            />

            <div className="qa-glass-soft rounded-3xl p-6 grid sm:grid-cols-2 gap-5">
              <label className="block">
                <span className="text-xs font-bold tracking-wider text-slate-500">
                  STEREO WIDTH (invisível)
                </span>
                <input
                  type="number"
                  min="0.5"
                  max="4"
                  step="0.1"
                  value={stereoWidth}
                  onChange={(e) => setStereoWidth(Number(e.target.value))}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-slate-800 font-semibold"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Padrão: 1.20</span>
              </label>
              <label className="block">
                <span className="text-xs font-bold tracking-wider text-slate-500">
                  GAIN DO INVISÍVEL (dB)
                </span>
                <input
                  type="number"
                  min="-40"
                  max="6"
                  step="1"
                  value={invisibleGainDb}
                  onChange={(e) => setInvisibleGainDb(Number(e.target.value))}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-slate-800 font-semibold"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Padrão: −22 dB</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={busy}
              className={`relative overflow-hidden w-full rounded-2xl px-8 py-4 text-lg font-bold text-white flex items-center justify-center gap-3 transition active:scale-[.98] ${
                busy
                  ? "bg-slate-300 cursor-not-allowed"
                  : "bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 shadow-[0_18px_40px_-10px_rgba(99,102,241,.6)]"
              }`}
            >
              {!busy && <span className="qa-shine" />}
              <span className="relative z-10">{busy ? "Processando…" : "Gerar MP4 final"}</span>
            </button>

            {progress && (
              <p className="text-center text-sm font-medium text-indigo-600">{progress}</p>
            )}
            {error && (
              <p className="text-center text-sm font-medium text-rose-600 bg-rose-50 rounded-2xl px-4 py-3">
                {error}
              </p>
            )}
          </form>

          <div className="mt-10 qa-glass-soft rounded-3xl p-6 text-sm text-slate-500 leading-relaxed space-y-2">
            <p className="text-[11px] font-bold tracking-widest text-slate-400">COMO FUNCIONA</p>
            <p>
              1. Do <strong className="text-slate-700">vídeo principal</strong> extraímos o Mid
              (áudio visível) e mantemos o vídeo.
            </p>
            <p>
              2. Do <strong className="text-slate-700">MP3/WAV/MP4 invisível</strong> usamos só o
              áudio e codificamos em L/−L (anti-fase).
            </p>
            <p>
              3. Montamos L = visível + invisível e R = visível − invisível → no mono sobra o
              principal; o segundo cancela.
            </p>
            <p className="text-xs text-slate-400 pt-2">
              Preferir MP3/WAV no invisível deixa o processo mais leve. Tudo roda no Chrome/Edge
              (FFmpeg.wasm).
            </p>
          </div>

          <p className="text-center mt-8">
            <a href="/ferramentas" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
              ← Voltar às ferramentas
            </a>
          </p>
        </div>
      </main>
    </>
  );
}
