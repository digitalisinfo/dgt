"use client";

import { useEffect, useRef, useState } from "react";
import AuroraBg from "@/components/aurora-bg";
import ToolsNav from "@/components/tools-nav";
import {
  estimateUsd,
  formatUsd,
  MAX_DURATION,
  MAX_SLOTS,
  MIN_DURATION,
  newSlot,
  planSlotReferences,
  slotFingerprint,
  timelineFingerprint,
} from "@/lib/studio-plan";

const STATUS = {
  idle: { label: "Aguardando", className: "bg-slate-100 text-slate-500" },
  generating: { label: "Gerando", className: "bg-amber-100 text-amber-800" },
  ready: { label: "Pronto", className: "bg-emerald-100 text-emerald-700" },
  error: { label: "Erro", className: "bg-rose-100 text-rose-700" },
};

const fieldClass =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-slate-800 outline-none focus:border-indigo-400";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatClock(seconds) {
  const total = Math.round(Number(seconds) || 0);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min <= 0) return `${sec}s`;
  return `${min}min ${String(sec).padStart(2, "0")}s`;
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function fileUrl(id, download = false) {
  return `/api/studio/files/${id}${download ? "?download=1" : ""}`;
}

function isStale(slot, index) {
  return Boolean(slot.status === "ready" && slot.fingerprint && slot.fingerprint !== slotFingerprint(slot, index));
}

function applyServerShape(local, server) {
  if (!local || !server || local.id !== server.id) return local;
  const remoteSlots = new Map((server.slots || []).map((slot) => [slot.id, slot]));
  const assets = server.assets || [];
  return {
    ...local,
    assets,
    finalFileId: server.finalFileId || null,
    finalFingerprint: server.finalFingerprint || null,
    updatedAt: server.updatedAt,
    timeline: (local.timeline || []).filter((item) => {
      if (item.type === "asset") return assets.some((asset) => asset.id === item.id);
      return (local.slots || []).some((slot) => slot.id === item.id);
    }),
    slots: (local.slots || []).map((slot, index) => {
      const remote = remoteSlots.get(slot.id);
      const videoRef = staleAssetRef(slot.videoRef, assets, index);
      const audioRef = staleAssetRef(slot.audioRef, assets, index);
      return {
        ...slot,
        videoRef,
        audioRef,
        imageIds: (slot.imageIds || []).filter((id) => assets.some((asset) => asset.id === id && asset.kind === "image")),
        extraVideoIds: (slot.extraVideoIds || []).filter((id) =>
          assets.some((asset) => asset.id === id && asset.kind === "video")
        ),
        status: remote?.status || slot.status,
        error: remote?.error ?? slot.error,
        outputFileId: remote ? remote.outputFileId : slot.outputFileId,
        outputRemoteUrl: remote ? remote.outputRemoteUrl : slot.outputRemoteUrl,
        outputRemoteExpiresAt: remote ? remote.outputRemoteExpiresAt : slot.outputRemoteExpiresAt,
        outputDurationSec: remote ? remote.outputDurationSec : slot.outputDurationSec,
        predictionId: remote ? remote.predictionId : slot.predictionId,
        fingerprint: remote ? remote.fingerprint : slot.fingerprint,
        startedAt: remote ? remote.startedAt : slot.startedAt,
      };
    }),
  };
}

function staleAssetRef(ref, assets, index) {
  if (!ref || ref === "auto" || ref === "none") return ref;
  if (ref.startsWith("asset:")) {
    const id = ref.slice(6);
    const exists = assets.some((asset) => asset.id === id && asset.kind === "video");
    if (!exists) return index === 0 ? "none" : "auto";
  }
  return ref;
}

function timelineSeconds(creative) {
  let total = 0;
  for (const item of creative.timeline || []) {
    if (item.type === "slot") {
      const slot = creative.slots.find((entry) => entry.id === item.id);
      total += Number(slot?.outputDurationSec || slot?.duration || 0);
    } else {
      const asset = creative.assets.find((entry) => entry.id === item.id);
      if (!asset) continue;
      total += asset.kind === "image" ? Number(item.durationSec || 3) : Number(asset.durationSec || 0);
    }
  }
  return total;
}

function summaryOf(creative) {
  return {
    id: creative.id,
    name: creative.name,
    updatedAt: creative.updatedAt,
    slotCount: creative.slots?.length || 0,
  };
}

export default function CriativosApp() {
  const [list, setList] = useState([]);
  const [creative, setCreative] = useState(null);
  const [replicateReady, setReplicateReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [saveState, setSaveState] = useState("");
  const [uploading, setUploading] = useState(false);
  const [job, setJob] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const creativeRef = useRef(null);
  const pendingRef = useRef(null);
  const flightRef = useRef(false);
  const timerRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    creativeRef.current = creative;
  }, [creative]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch("/api/studio/creatives");
        if (res.status === 401) {
          window.location.href = "/login?next=/criativos";
          return;
        }
        const data = await res.json();
        if (cancel) return;
        setList(data.creatives || []);
        setReplicateReady(Boolean(data.replicateConfigured));
        const stored = sessionStorage.getItem("criativoId");
        const match = (data.creatives || []).find((item) => item.id === stored);
        if (match) await openCreative(match.id, { silent: true });
      } catch (err) {
        if (!cancel) setPageError(err.message || "Não consegui carregar os criativos.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
    // openCreative é estável o bastante para o primeiro carregamento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runningKey = (creative?.slots || [])
    .filter((slot) => slot.status === "generating" && slot.predictionId)
    .map((slot) => `${slot.id}:${slot.predictionId}`)
    .join("|");

  useEffect(() => {
    if (!runningKey || !creative?.id) return undefined;
    const creativeId = creative.id;
    const slotIds = creative.slots
      .filter((slot) => slot.status === "generating" && slot.predictionId)
      .map((slot) => slot.id);
    let stop = false;

    async function loop() {
      while (!stop && slotIds.length) {
        await sleep(4000);
        if (stop) return;
        for (const slotId of [...slotIds]) {
          try {
            const res = await fetch(`/api/studio/generate?creativeId=${creativeId}&slotId=${slotId}`);
            const data = await res.json().catch(() => ({}));
            if (data.creative) applyServer(data.creative);
            const slot = data.creative?.slots?.find((item) => item.id === slotId);
            if (slot && slot.status !== "generating") {
              const at = slotIds.indexOf(slotId);
              if (at >= 0) slotIds.splice(at, 1);
            }
            if (!res.ok && data.error && slot?.status === "error") setPageError(data.error);
          } catch (err) {
            setPageError(err.message || "Falha ao consultar a geração.");
          }
        }
      }
    }

    loop();
    return () => {
      stop = true;
    };
    // O loop acompanha os ids que já estão gerando; não precisa reiniciar a cada keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningKey]);

  function applyServer(server) {
    setCreative((prev) => {
      const next = applyServerShape(prev, server);
      if (!next) return prev;
      creativeRef.current = next;
      if (pendingRef.current?.id === next.id) pendingRef.current = next;
      return next;
    });
    setList((prev) => prev.map((item) => (item.id === server.id ? { ...item, ...summaryOf(server) } : item)));
  }

  async function drain() {
    while (flightRef.current) await sleep(30);
    flightRef.current = true;
    try {
      while (pendingRef.current) {
        const snapshot = pendingRef.current;
        pendingRef.current = null;
        setSaveState("salvando");
        const res = await fetch(`/api/studio/creatives/${snapshot.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: snapshot.name,
            slots: snapshot.slots,
            timeline: snapshot.timeline,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          window.location.href = "/login?next=/criativos";
          return;
        }
        if (!res.ok) throw new Error(data.error || "Não consegui salvar.");
        setSaveState("salvo");
        if (data.creative) {
          setList((prev) => prev.map((item) => (item.id === data.creative.id ? summaryOf(data.creative) : item)));
        }
      }
    } catch (err) {
      setSaveState("erro");
      setPageError(err.message || "Não consegui salvar.");
      throw err;
    } finally {
      flightRef.current = false;
    }
  }

  function queueSave(next) {
    pendingRef.current = next;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      drain().catch(() => {});
    }, 700);
  }

  async function flush() {
    clearTimeout(timerRef.current);
    if (creativeRef.current) pendingRef.current = creativeRef.current;
    await drain();
  }

  function patchCreative(recipe) {
    setCreative((prev) => {
      if (!prev) return prev;
      const next = typeof recipe === "function" ? recipe(prev) : recipe;
      creativeRef.current = next;
      queueSave(next);
      return next;
    });
  }

  async function openCreative(id, { silent } = {}) {
    if (!silent) setPageError("");
    const res = await fetch(`/api/studio/creatives/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPageError(data.error || "Não encontrei o criativo.");
      return;
    }
    pendingRef.current = null;
    creativeRef.current = data.creative;
    setCreative(data.creative);
    setSaveState("");
    sessionStorage.setItem("criativoId", id);
  }

  async function createOne() {
    setPageError("");
    const res = await fetch("/api/studio/creatives", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPageError(data.error || "Não consegui criar.");
      return;
    }
    setList((prev) => [summaryOf(data.creative), ...prev.filter((item) => item.id !== data.creative.id)]);
    pendingRef.current = null;
    creativeRef.current = data.creative;
    setCreative(data.creative);
    sessionStorage.setItem("criativoId", data.creative.id);
  }

  async function removeCreative() {
    if (!creative) return;
    if (!window.confirm("Apagar este criativo e os arquivos dele?")) return;
    const id = creative.id;
    await fetch(`/api/studio/creatives/${id}`, { method: "DELETE" });
    setList((prev) => prev.filter((item) => item.id !== id));
    setCreative(null);
    creativeRef.current = null;
    sessionStorage.removeItem("criativoId");
  }

  async function uploadFiles(fileList) {
    if (!creative || !fileList?.length) return;
    setUploading(true);
    setPageError("");
    try {
      await flush();
      let latest = null;
      for (const file of fileList) {
        const body = new FormData();
        body.set("creativeId", creative.id);
        body.set("file", file);
        const res = await fetch("/api/studio/assets", { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Falha ao enviar ${file.name}`);
        latest = data.creative;
        if (latest) applyServer(latest);
      }
    } catch (err) {
      setPageError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAsset(assetId) {
    if (!creative) return;
    setPageError("");
    await flush();
    const res = await fetch("/api/studio/assets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creativeId: creative.id, assetId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPageError(data.error || "Não consegui remover.");
      return;
    }
    if (data.creative) applyServer(data.creative);
  }

  async function waitSlot(creativeId, slotId) {
    const started = Date.now();
    while (Date.now() - started < 15 * 60 * 1000) {
      await sleep(4000);
      const res = await fetch(`/api/studio/generate?creativeId=${creativeId}&slotId=${slotId}`);
      const data = await res.json().catch(() => ({}));
      if (data.creative) applyServer(data.creative);
      const slot = data.creative?.slots?.find((item) => item.id === slotId);
      if (slot && slot.status !== "generating") return slot;
      if (!res.ok && !data.creative) throw new Error(data.error || "Falha ao consultar a geração.");
    }
    throw new Error("A geração passou de 15 minutos. Atualize a página para ver se ela terminou.");
  }

  function askSpend(from, to, extra) {
    const { usd, includes480 } = estimateUsd(creative.slots, from, to);
    const lines = ["Isso envia o pedido ao Replicate e gasta créditos da conta."];
    if (usd > 0) lines.push(`Estimativa em 720p: ${formatUsd(usd)} (US$ 0,23 por segundo).`);
    if (includes480) lines.push("Há slot em 480p. A estimativa acima não inclui esses segundos.");
    if (extra) lines.push(extra);
    lines.push("Continuar?");
    return window.confirm(lines.join("\n\n"));
  }

  async function runSlots(ids, from, to, extra) {
    if (!creative || job) return;
    if (!ids.length) {
      setPageError("Nada pendente para gerar.");
      return;
    }
    if (!askSpend(from, to, extra)) return;
    const creativeId = creative.id;
    setJob("generate");
    setPageError("");
    try {
      await flush();
      for (const slotId of ids) {
        const res = await fetch("/api/studio/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creativeId, slotId }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.creative) applyServer(data.creative);
        if (!res.ok) throw new Error(data.error || "Falha ao gerar.");
        const settled = await waitSlot(creativeId, slotId);
        if (!settled || settled.status === "error") {
          throw new Error(settled?.error || "O slot falhou.");
        }
      }
    } catch (err) {
      setPageError(err.message);
    } finally {
      setJob("");
    }
  }

  function generateOne(index) {
    const slot = creative.slots[index];
    const downstream = index < creative.slots.length - 1;
    runSlots(
      [slot.id],
      index,
      index + 1,
      downstream ? "As saídas dos slots seguintes serão apagadas, porque o encadeamento muda." : ""
    );
  }

  function generateSequence() {
    const start = creative.slots.findIndex((slot, index) => slot.status !== "ready" || isStale(slot, index));
    if (start < 0) {
      setPageError("Todos os slots já estão prontos e atualizados.");
      return;
    }
    const ids = creative.slots.slice(start).map((slot) => slot.id);
    runSlots(
      ids,
      start,
      creative.slots.length,
      ids.length > 1 ? "A sequência gera este slot e os seguintes, um depois do outro." : ""
    );
  }

  async function assemble() {
    if (!creative || job) return;
    setJob("assemble");
    setPageError("");
    try {
      await flush();
      const res = await fetch("/api/studio/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creativeId: creative.id,
          timeline: creativeRef.current?.timeline || creative.timeline,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não consegui montar o vídeo.");
      if (data.creative) applyServer(data.creative);
    } catch (err) {
      setPageError(err.message);
    } finally {
      setJob("");
    }
  }

  const finalStale =
    creative?.finalFileId &&
    creative.finalFingerprint &&
    timelineFingerprint(creative.timeline) !== creative.finalFingerprint;

  return (
    <>
      <AuroraBg />
      <main className="relative min-h-screen px-5 py-10 sm:py-14">
        <div className="max-w-6xl mx-auto">
          <ToolsNav current="/criativos" />
          <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div>
              <p className="text-[11px] font-bold tracking-widest text-indigo-500 mb-2">ANÚNCIOS UGC · 9:16</p>
              <h1 className="text-3xl sm:text-4xl font-black text-slate-900">Criativos</h1>
              <p className="text-slate-500 mt-2 max-w-2xl text-sm leading-relaxed">
                Sobe as referências, escreve até 4 slots e gera no Seedance 2.5. O slot 1 cria a pessoa. Cada slot
                seguinte recebe o vídeo e a voz do anterior, para manter o mesmo rosto.
              </p>
            </div>
            <button
              type="button"
              onClick={createOne}
              className="rounded-2xl bg-slate-900 text-white font-bold px-4 py-3 text-sm"
            >
              Novo criativo
            </button>
          </div>

          {!replicateReady && (
            <p className="mb-5 text-sm font-medium text-amber-800 bg-amber-50 rounded-2xl px-4 py-3">
              Falta o REPLICATE_API_TOKEN no .env. Dá para montar o criativo, mas a geração só funciona depois de
              reiniciar o servidor com o token.
            </p>
          )}
          {pageError && (
            <p className="mb-5 text-sm font-medium text-rose-700 bg-rose-50 rounded-2xl px-4 py-3">{pageError}</p>
          )}

          <div className="grid lg:grid-cols-[240px_minmax(0,1fr)] gap-6 items-start">
            <aside className="qa-glass-soft rounded-3xl p-4 lg:sticky lg:top-4">
              <p className="text-[11px] font-bold tracking-widest text-slate-400 px-2 mb-2">CRIATIVOS</p>
              {loading && <p className="text-sm text-slate-500 px-2 py-3">Carregando…</p>}
              {!loading && list.length === 0 && (
                <p className="text-sm text-slate-500 px-2 py-3">Nenhum ainda. Crie o primeiro.</p>
              )}
              <ul className="space-y-1">
                {list.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openCreative(item.id)}
                      className={`w-full text-left rounded-2xl px-3 py-2.5 transition ${
                        creative?.id === item.id ? "bg-white shadow-sm" : "hover:bg-white/70"
                      }`}
                    >
                      <span className="block text-sm font-bold text-slate-800 truncate">{item.name}</span>
                      <span className="block text-[11px] text-slate-400">{item.slotCount} slots</span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            {!creative && (
              <section className="qa-glass rounded-3xl p-8 text-slate-500">
                Escolha um criativo ou crie um novo. Os arquivos ficam neste servidor por 7 dias.
              </section>
            )}

            {creative && (
              <div className="space-y-6">
                <section className="qa-glass rounded-3xl p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <label className="block flex-1 min-w-[220px]">
                      <span className="text-[11px] font-bold tracking-widest text-slate-400">NOME</span>
                      <input
                        value={creative.name}
                        onChange={(e) => patchCreative((prev) => ({ ...prev, name: e.target.value.slice(0, 80) }))}
                        className={fieldClass}
                      />
                    </label>
                    <div className="flex items-center gap-3 pt-5">
                      <span className="text-xs font-semibold text-slate-400">
                        {saveState === "salvando" && "Salvando…"}
                        {saveState === "salvo" && "Salvo"}
                        {saveState === "erro" && "Erro ao salvar"}
                      </span>
                      <button type="button" onClick={removeCreative} className="text-sm font-semibold text-rose-600">
                        Apagar
                      </button>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-slate-500 leading-relaxed">
                    Hook simples usa 1 slot. Criativo com cortes do app usa 3 ou 4 slots e os vídeos de tela entram na
                    timeline, entre os clipes. Sem referências, são 2 a 4 slots só concatenados.
                  </p>
                </section>

                <AssetSection
                  creative={creative}
                  uploading={uploading}
                  fileRef={fileRef}
                  onFiles={uploadFiles}
                  onRemove={removeAsset}
                />

                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-black text-slate-900">Slots</h2>
                    <button
                      type="button"
                      disabled={creative.slots.length >= MAX_SLOTS || Boolean(job)}
                      onClick={() =>
                        patchCreative((prev) => ({
                          ...prev,
                          slots: [...prev.slots, newSlot(prev.slots.length)].slice(0, MAX_SLOTS),
                        }))
                      }
                      className="text-sm font-bold text-indigo-600 disabled:text-slate-300"
                    >
                      Adicionar slot
                    </button>
                  </div>

                  {creative.slots.map((slot, index) => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      index={index}
                      creative={creative}
                      now={now}
                      busy={Boolean(job)}
                      onPatch={(recipe) =>
                        patchCreative((prev) => ({
                          ...prev,
                          slots: prev.slots.map((item) => (item.id === slot.id ? recipe(item) : item)),
                        }))
                      }
                      onRemove={() =>
                        patchCreative((prev) => ({
                          ...prev,
                          slots: prev.slots.filter((item) => item.id !== slot.id),
                          timeline: prev.timeline.filter((item) => !(item.type === "slot" && item.id === slot.id)),
                        }))
                      }
                      onGenerate={() => generateOne(index)}
                    />
                  ))}

                  <SequenceBar creative={creative} busy={Boolean(job)} onRun={generateSequence} />
                </section>

                <TimelineSection
                  creative={creative}
                  busy={job === "assemble" || job === "generate"}
                  assembling={job === "assemble"}
                  finalStale={finalStale}
                  onPatch={patchCreative}
                  onAssemble={assemble}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function AssetSection({ creative, uploading, fileRef, onFiles, onRemove }) {
  return (
    <section
      className="qa-glass rounded-3xl p-6"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900">Assets</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            Tela do app, comprovante ou avatar. Eles podem entrar como referência de um slot e também como corte na
            timeline.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-xl bg-indigo-50 text-indigo-700 font-bold text-sm px-4 py-2 disabled:opacity-60"
        >
          {uploading ? "Enviando…" : "Enviar arquivos"}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="video/mp4,video/quicktime,image/png,image/jpeg,image/webp,.mp4,.mov,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {creative.assets.length === 0 && (
        <p className="mt-4 text-sm text-slate-400">Nenhum arquivo ainda. Arraste para cá ou use o botão.</p>
      )}

      <ul className="mt-4 grid sm:grid-cols-2 gap-3">
        {creative.assets.map((asset) => (
          <li key={asset.id} className="rounded-2xl bg-white/70 p-3 flex gap-3">
            {asset.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(asset.id)} alt="" className="w-16 h-16 rounded-xl object-cover bg-slate-100" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">
                VÍDEO
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate">{asset.name}</p>
              <p className="text-xs text-slate-400">
                {asset.kind === "image" ? "Imagem" : "Vídeo"}
                {asset.durationSec ? ` · ${formatClock(asset.durationSec)}` : ""} · {formatBytes(asset.bytes)}
              </p>
              <button type="button" onClick={() => onRemove(asset.id)} className="text-xs font-semibold text-rose-600 mt-1">
                Remover
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SlotCard({ slot, index, creative, now, busy, onPatch, onRemove, onGenerate }) {
  const plan = planSlotReferences(slot, index, creative.slots, creative.assets);
  const stale = slot.status !== "generating" && isStale(slot, index);
  const images = creative.assets.filter((asset) => asset.kind === "image");
  const videos = creative.assets.filter((asset) => asset.kind === "video");
  const status = stale ? { label: "Desatualizado", className: "bg-amber-100 text-amber-800" } : STATUS[slot.status] || STATUS.idle;

  function toggle(listName, id) {
    onPatch((current) => {
      const list = current[listName] || [];
      const next = list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
      return { ...current, [listName]: next };
    });
  }

  return (
    <article className="qa-glass rounded-3xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-black text-slate-900">Slot {index + 1}</h3>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold rounded-full px-2.5 py-1 ${status.className}`}>{status.label}</span>
          {slot.status === "generating" && slot.startedAt && (
            <span className="text-xs font-semibold text-amber-700">{formatElapsed(now - new Date(slot.startedAt).getTime())}</span>
          )}
          {creative.slots.length > 1 && (
            <button type="button" onClick={onRemove} disabled={busy || slot.status === "generating"} className="text-xs font-semibold text-slate-400 disabled:opacity-40">
              Remover
            </button>
          )}
        </div>
      </div>

      {index === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Este slot cria o rosto e a voz. Os próximos usam esta saída como referência.</p>
      ) : (
        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <RefSelect
            label="VÍDEO DE REFERÊNCIA (ROSTO)"
            value={slot.videoRef || "auto"}
            onChange={(value) => onPatch((current) => ({ ...current, videoRef: value }))}
            index={index}
            slots={creative.slots}
            assets={videos}
          />
          <RefSelect
            label="ÁUDIO DE REFERÊNCIA (VOZ)"
            value={slot.audioRef || "auto"}
            onChange={(value) => onPatch((current) => ({ ...current, audioRef: value }))}
            index={index}
            slots={creative.slots}
            assets={videos}
          />
        </div>
      )}

      <label className="block mt-4">
        <span className="text-[11px] font-bold tracking-widest text-slate-400">PROMPT</span>
        <textarea
          rows={7}
          value={slot.prompt}
          onChange={(e) => onPatch((current) => ({ ...current, prompt: e.target.value }))}
          placeholder='Descreva a cena e a fala. Para diálogo, use aspas: Ele diz "olha isso".'
          className={`${fieldClass} font-medium leading-relaxed`}
        />
      </label>

      <div className="mt-4 grid sm:grid-cols-3 gap-4">
        <label className="block">
          <span className="text-[11px] font-bold tracking-widest text-slate-400">DURAÇÃO · {slot.duration}s</span>
          <input
            type="range"
            min={MIN_DURATION}
            max={MAX_DURATION}
            value={slot.duration}
            onChange={(e) => onPatch((current) => ({ ...current, duration: Number(e.target.value) }))}
            className="mt-3 w-full accent-indigo-600"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold tracking-widest text-slate-400">RESOLUÇÃO</span>
          <select
            value={slot.resolution}
            onChange={(e) => onPatch((current) => ({ ...current, resolution: e.target.value }))}
            className={fieldClass}
          >
            <option value="720p">720p</option>
            <option value="480p">480p</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-bold tracking-widest text-slate-400">PROPORÇÃO</span>
          <input value="9:16" readOnly className={`${fieldClass} text-slate-500`} />
        </label>
      </div>

      {(images.length > 0 || videos.length > 0) && (
        <div className="mt-4 space-y-3">
          {images.length > 0 && (
            <ChipRow
              label="IMAGENS"
              hint="A ordem dos cliques vira [Image1], [Image2]…"
              assets={images}
              selected={slot.imageIds || []}
              tags={plan.images}
              onToggle={(id) => toggle("imageIds", id)}
            />
          )}
          {videos.length > 0 && (
            <ChipRow
              label="VÍDEOS EXTRAS"
              hint="Some com o clipe anterior: o Seedance aceita no máximo 30s de vídeo de referência. Corte de timeline não entra nessa conta."
              assets={videos}
              selected={slot.extraVideoIds || []}
              tags={plan.videos.filter((item) => item.kind === "asset")}
              onToggle={(id) => toggle("extraVideoIds", id)}
            />
          )}
        </div>
      )}

      <Legend plan={plan} />

      {slot.error && slot.status === "error" && (
        <p className="mt-4 text-sm font-medium text-rose-700 bg-rose-50 rounded-2xl px-4 py-3">{slot.error}</p>
      )}
      {stale && (
        <p className="mt-4 text-sm text-amber-800 bg-amber-50 rounded-2xl px-4 py-3">
          O prompt ou as referências mudaram depois desta geração.
        </p>
      )}

      {slot.outputFileId && (
        <div className="mt-4">
          <video
            key={slot.outputFileId}
            src={fileUrl(slot.outputFileId)}
            controls
            playsInline
            className="w-full max-w-[280px] rounded-2xl bg-black aspect-[9/16]"
          />
          <a href={fileUrl(slot.outputFileId, true)} className="inline-block mt-2 text-sm font-semibold text-indigo-600">
            Baixar este clipe
          </a>
        </div>
      )}

      <button
        type="button"
        onClick={onGenerate}
        disabled={busy || !slot.prompt.trim()}
        className={`mt-5 rounded-2xl px-5 py-3 text-sm font-bold text-white transition ${
          busy || !slot.prompt.trim()
            ? "bg-slate-300 cursor-not-allowed"
            : "bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600"
        }`}
      >
        {slot.status === "generating" ? "Gerando…" : slot.outputFileId ? "Gerar de novo" : "Gerar este slot"}
      </button>
    </article>
  );
}

function RefSelect({ label, value, onChange, index, slots, assets }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold tracking-widest text-slate-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
        {index > 0 && <option value="auto">Automático (slot anterior)</option>}
        <option value="none">Nenhum</option>
        {slots.slice(0, index).map((slot, slotIndex) =>
          slot.outputFileId ? (
            <option key={slot.id} value={`slot:${slot.id}`}>
              Saída do Slot {slotIndex + 1}
            </option>
          ) : null
        )}
        {assets.map((asset) => (
          <option key={asset.id} value={`asset:${asset.id}`}>
            {asset.name}
            {asset.durationSec ? ` (${formatClock(asset.durationSec)})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChipRow({ label, hint, assets, selected, tags, onToggle }) {
  return (
    <div>
      <p className="text-[11px] font-bold tracking-widest text-slate-400">{label}</p>
      <p className="text-xs text-slate-400 mt-1">{hint}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {assets.map((asset) => {
          const on = selected.includes(asset.id);
          const tag = tags.find((item) => item.id === asset.id)?.tag;
          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => onToggle(asset.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${
                on ? "bg-indigo-600 text-white border-indigo-600" : "bg-white/80 text-slate-600 border-slate-200"
              }`}
            >
              {on && tag ? `${tag} · ` : ""}
              {asset.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ plan }) {
  const rows = [...plan.images, ...plan.videos, ...plan.audios];
  if (!rows.length && !plan.blockers.length && !plan.hints.length) return null;
  return (
    <div className="mt-4 rounded-2xl bg-white/60 px-4 py-3 space-y-1">
      {rows.map((item) => (
        <p key={`${item.tag}-${item.kind}-${item.id}`} className="text-xs text-slate-600">
          <span className="font-bold text-slate-800">{item.tag}</span> {item.name}
          {item.media === "audio" ? " · áudio extraído do vídeo" : ""}
          {item.durationSec ? ` · ${formatClock(item.durationSec)}` : ""}
        </p>
      ))}
      {plan.hints.map((hint) => (
        <p key={hint} className="text-xs text-slate-500">
          {hint}
        </p>
      ))}
      {plan.blockers.map((blocker) => (
        <p key={blocker} className="text-xs font-medium text-rose-600">
          {blocker}
        </p>
      ))}
      {rows.length > 0 && (
        <p className="text-xs text-slate-400 pt-1">Cite essas tags no prompt quando quiser amarrar a referência.</p>
      )}
    </div>
  );
}

function SequenceBar({ creative, busy, onRun }) {
  const start = creative.slots.findIndex((slot, index) => slot.status !== "ready" || isStale(slot, index));
  const from = start < 0 ? creative.slots.length : start;
  const { usd, includes480 } = estimateUsd(creative.slots, from);
  const pending = creative.slots.length - from;
  return (
    <div className="qa-glass-soft rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-slate-800">Gerar sequência</p>
        <p className="text-xs text-slate-500 mt-1">
          {pending > 0
            ? `${pending} slot(s) pendente(s). Áudio e lip sync ficam ligados. Proporção 9:16.`
            : "Todos os slots estão prontos."}
          {usd > 0 ? ` Estimativa 720p: ${formatUsd(usd)}.` : ""}
          {includes480 ? " 480p fica de fora dessa conta." : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onRun}
        disabled={busy || pending === 0}
        className={`rounded-2xl px-5 py-3 text-sm font-bold text-white ${
          busy || pending === 0 ? "bg-slate-300 cursor-not-allowed" : "bg-slate-900"
        }`}
      >
        {busy ? "Trabalhando…" : "Gerar sequência"}
      </button>
    </div>
  );
}

function TimelineSection({ creative, busy, assembling, finalStale, onPatch, onAssemble }) {
  function move(from, to) {
    if (from === to || from < 0 || to < 0) return;
    onPatch((prev) => {
      const timeline = [...prev.timeline];
      const [item] = timeline.splice(from, 1);
      timeline.splice(to, 0, item);
      return { ...prev, timeline };
    });
  }

  function add(item) {
    onPatch((prev) => ({ ...prev, timeline: [...prev.timeline, item] }));
  }

  function updateDuration(index, durationSec) {
    onPatch((prev) => ({
      ...prev,
      timeline: prev.timeline.map((item, itemIndex) => (itemIndex === index ? { ...item, durationSec } : item)),
    }));
  }

  const total = timelineSeconds(creative);

  return (
    <section className="qa-glass rounded-3xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900">Timeline</h2>
          <p className="text-sm text-slate-500 mt-1">
            Arraste ou use as setas. Duração estimada: {formatClock(total)}.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            onPatch((prev) => ({
              ...prev,
              timeline: prev.slots
                .filter((slot) => slot.status === "ready" && slot.outputFileId)
                .map((slot) => ({ type: "slot", id: slot.id })),
            }))
          }
          className="text-sm font-bold text-indigo-600"
        >
          Preencher com os slots prontos
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {creative.slots.map((slot, index) => (
          <button
            key={slot.id}
            type="button"
            disabled={!slot.outputFileId}
            onClick={() => add({ type: "slot", id: slot.id })}
            className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40"
          >
            + Slot {index + 1}
          </button>
        ))}
        {creative.assets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            onClick={() =>
              add(
                asset.kind === "image"
                  ? { type: "asset", id: asset.id, durationSec: 3 }
                  : { type: "asset", id: asset.id }
              )
            }
            className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600"
          >
            + {asset.name}
          </button>
        ))}
      </div>

      {creative.timeline.length === 0 && (
        <p className="mt-4 text-sm text-slate-400">A timeline está vazia.</p>
      )}

      <ul className="mt-4 space-y-2">
        {creative.timeline.map((item, index) => {
          const slotIndex = creative.slots.findIndex((slot) => slot.id === item.id);
          const asset = creative.assets.find((entry) => entry.id === item.id);
          const label =
            item.type === "slot"
              ? `Slot ${slotIndex + 1}`
              : asset?.name || "Arquivo removido";
          const image = item.type === "asset" && asset?.kind === "image";
          return (
            <li
              key={`${item.type}-${item.id}-${index}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", String(index))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                move(Number(e.dataTransfer.getData("text/plain")), index);
              }}
              className="rounded-2xl bg-white/75 px-3 py-3 flex flex-wrap items-center gap-3 cursor-grab"
            >
              <span className="text-xs font-bold text-slate-400 w-6">{index + 1}</span>
              <span className="text-sm font-semibold text-slate-800 flex-1 min-w-[140px] truncate">{label}</span>
              {image && (
                <label className="text-xs text-slate-500 flex items-center gap-2">
                  segundos
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={item.durationSec || 3}
                    onChange={(e) => updateDuration(index, Math.min(15, Math.max(1, Number(e.target.value) || 3)))}
                    className="w-16 rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-700"
                  />
                </label>
              )}
              <button type="button" onClick={() => move(index, index - 1)} className="text-xs font-bold text-slate-500">
                Subir
              </button>
              <button type="button" onClick={() => move(index, index + 1)} className="text-xs font-bold text-slate-500">
                Descer
              </button>
              <button
                type="button"
                onClick={() =>
                  onPatch((prev) => ({
                    ...prev,
                    timeline: prev.timeline.filter((_, itemIndex) => itemIndex !== index),
                  }))
                }
                className="text-xs font-semibold text-rose-600"
              >
                Tirar
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onAssemble}
        disabled={busy || creative.timeline.length === 0}
        className={`mt-5 w-full rounded-2xl px-5 py-3.5 text-sm font-bold text-white ${
          busy || creative.timeline.length === 0
            ? "bg-slate-300 cursor-not-allowed"
            : "bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600"
        }`}
      >
        {assembling ? "Montando vídeo final…" : "Montar vídeo final"}
      </button>

      {creative.finalFileId && (
        <div className="mt-5">
          {finalStale && (
            <p className="mb-3 text-sm text-amber-800 bg-amber-50 rounded-2xl px-4 py-3">
              A timeline mudou desde a última montagem. Monte de novo para baixar a versão nova.
            </p>
          )}
          <video
            key={creative.finalFileId}
            src={fileUrl(creative.finalFileId)}
            controls
            playsInline
            className="w-full max-w-[320px] rounded-2xl bg-black aspect-[9/16]"
          />
          <a
            href={fileUrl(creative.finalFileId, true)}
            className="inline-flex mt-3 rounded-xl bg-slate-900 text-white text-sm font-bold px-4 py-2"
          >
            Download
          </a>
        </div>
      )}
    </section>
  );
}
