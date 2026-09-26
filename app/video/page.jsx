"use client";

import { useEffect, useRef, useState } from "react";
import ToolsNav from "@/components/tools-nav";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { cleanOutputName, isVideoFile, stripMetadataArgs, videoFileExt } from "@/lib/video-metadata";

const MAX_FILES = 10;

function formatSize(file) {
  return `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeForExt(ext) {
  if (ext === "webm") return "video/webm";
  if (ext === "mkv") return "video/x-matroska";
  if (ext === "mov") return "video/quicktime";
  return "video/mp4";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return url;
}

function FilePicker({ label, hint, files, onChange, onRemove, accent, accept, badge }) {
  return (
    <div className="qa-glass rounded-3xl p-6">
      <label className="block cursor-pointer hover:opacity-95 transition">
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
          multiple
          className="mt-4 block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          onChange={(e) => {
            const picked = Array.from(e.target.files || []).filter(isVideoFile);
            onChange(picked);
            e.target.value = "";
          }}
        />
      </label>

      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 px-3 py-2"
            >
              <p className="text-sm text-slate-700 font-medium truncate">
                {index + 1}. {file.name}{" "}
                <span className="text-slate-400 font-normal">({formatSize(file)})</span>
              </p>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="text-xs font-semibold text-slate-500 hover:text-rose-600 whitespace-nowrap"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function VideoCleanPage() {
  const ffmpegRef = useRef(null);
  const jobLabelRef = useRef("");
  const resultUrlsRef = useRef([]);
  const [videos, setVideos] = useState([]);
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  useEffect(() => {
    return () => {
      for (const url of resultUrlsRef.current) URL.revokeObjectURL(url);
    };
  }, []);

  function clearResults() {
    for (const url of resultUrlsRef.current) URL.revokeObjectURL(url);
    resultUrlsRef.current = [];
    setResults([]);
  }

  function handleFilesPicked(picked) {
    const next = picked.slice(0, MAX_FILES);
    setVideos(next);
    clearResults();
    setError(
      picked.length > MAX_FILES
        ? `No máximo ${MAX_FILES} arquivos por vez. Os ${MAX_FILES} primeiros foram mantidos.`
        : ""
    );
    setProgress("");
  }

  function handleRemove(index) {
    setVideos((prev) => prev.filter((_, i) => i !== index));
    setError("");
  }

  async function ensureFfmpeg() {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current;

    setProgress("Carregando FFmpeg no navegador (1ª vez pode demorar)…");
    const ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => {
      if (message) console.debug("[ffmpeg]", message);
    });
    ffmpeg.on("progress", ({ progress: p }) => {
      if (Number.isFinite(p) && p > 0) {
        const prefix = jobLabelRef.current;
        setProgress(`${prefix}Processando… ${Math.min(99, Math.round(p * 100))}%`);
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

  async function cleanOne(ffmpeg, video, index, total) {
    const ext = videoFileExt(video, "mp4");
    const inputName = `input-${index}.${ext}`;
    const outputName = `out-${index}.${ext}`;
    jobLabelRef.current = `${index + 1}/${total} · ${video.name} · `;
    setProgress(`${jobLabelRef.current}Lendo o vídeo…`);

    await ffmpeg.writeFile(inputName, await fetchFile(video));
    setProgress(`${jobLabelRef.current}Clonando streams e limpando metadados…`);
    await ffmpeg.exec(stripMetadataArgs(inputName, outputName, { ext }));

    const out = await ffmpeg.readFile(outputName);
    const bytes = out instanceof Uint8Array ? out : new Uint8Array(out);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy], { type: mimeForExt(ext) });
    const filename = cleanOutputName(video.name);
    const url = downloadBlob(blob, filename);

    for (const f of [inputName, outputName]) {
      try {
        await ffmpeg.deleteFile(f);
      } catch {
        /* ignore */
      }
    }

    return { name: video.name, filename, url };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setProgress("");

    if (videos.length === 0) {
      setError("Selecione pelo menos um arquivo de vídeo.");
      return;
    }

    setBusy(true);
    clearResults();
    const nextResults = [];
    const failures = [];

    try {
      const ffmpeg = await ensureFfmpeg();

      for (let i = 0; i < videos.length; i++) {
        try {
          const result = await cleanOne(ffmpeg, videos[i], i, videos.length);
          resultUrlsRef.current.push(result.url);
          nextResults.push(result);
          setResults([...nextResults]);
        } catch (err) {
          console.error(err);
          failures.push(`${videos[i].name}: ${err?.message || "falha"}`);
        }
      }

      if (nextResults.length === 0) {
        setError(failures.join(" ") || "Erro inesperado no processamento.");
        setProgress("");
        return;
      }

      const doneLabel =
        nextResults.length === 1
          ? "Pronto! O vídeo limpo foi baixado (processado no seu navegador)."
          : `Pronto! ${nextResults.length} vídeos limpos. Se algum download não iniciou, use a lista abaixo.`;
      setProgress(doneLabel);
      if (failures.length) {
        setError(`${failures.length} arquivo(s) falharam. ${failures.join(" ")}`);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Erro inesperado no processamento.");
      setProgress("");
    } finally {
      jobLabelRef.current = "";
      setBusy(false);
    }
  }

  const buttonLabel = busy
    ? "Processando…"
    : videos.length > 1
      ? `Limpar ${videos.length} vídeos`
      : "Limpar metadados";

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
          <ToolsNav current="/video" />
          <div className="text-center mb-10">
            <p className="text-[11px] font-bold tracking-widest text-indigo-500 mb-2">
              TOOL · METADATA
            </p>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight">
              Video Clean
            </h1>
            <p className="text-slate-500 mt-3 max-w-xl mx-auto">
              Envie até <strong className="text-slate-700">{MAX_FILES} vídeos</strong> e receba
              clones com os metadados do container zerados. Sem reencode — só remux com FFmpeg.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <FilePicker
              label="VÍDEOS"
              hint={`Selecione até ${MAX_FILES} arquivos. Os originais não são alterados.`}
              files={videos}
              onChange={handleFilesPicked}
              onRemove={handleRemove}
              accent="text-indigo-500"
              accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/*,.mp4,.mov,.m4v,.webm,.mkv"
              badge={`ATÉ ${MAX_FILES} · MP4 · MOV · WEBM · MKV`}
            />

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
              <span className="relative z-10">{buttonLabel}</span>
            </button>

            {progress && (
              <p className="text-center text-sm font-medium text-indigo-600">{progress}</p>
            )}
            {error && (
              <p className="text-center text-sm font-medium text-rose-600 bg-rose-50 rounded-2xl px-4 py-3">
                {error}
              </p>
            )}

            {results.length > 0 && (
              <div className="qa-glass-soft rounded-3xl p-5 space-y-3">
                <p className="text-[11px] font-bold tracking-widest text-slate-400">
                  ARQUIVOS LIMPOS
                </p>
                <ul className="space-y-2">
                  {results.map((item) => (
                    <li key={item.url} className="flex items-center justify-between gap-3">
                      <p className="text-sm text-slate-700 font-medium truncate">{item.filename}</p>
                      <a
                        href={item.url}
                        download={item.filename}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
                      >
                        Baixar
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>

          <div className="mt-10 qa-glass-soft rounded-3xl p-6 text-sm text-slate-500 leading-relaxed space-y-2">
            <p className="text-[11px] font-bold tracking-widest text-slate-400">COMO FUNCIONA</p>
            <p>
              1. O FFmpeg <strong className="text-slate-700">copia</strong> o vídeo e o áudio
              originais, sem recomprimir.
            </p>
            <p>
              2. Remove metadados do container: título, comentário, data de criação, encoder, GPS,
              capítulos e tags extras.
            </p>
            <p>
              3. Processa até <strong className="text-slate-700">{MAX_FILES} arquivos</strong> em
              sequência e entrega cada um com sufixo{" "}
              <strong className="text-slate-700">-clean</strong>.
            </p>
            <p className="text-xs text-slate-400 pt-2">
              Tudo roda no Chrome/Edge (FFmpeg.wasm). O original permanece no seu computador.
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
