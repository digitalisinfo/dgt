"use client";

import { useEffect, useState } from "react";
import AuroraBg from "@/components/aurora-bg";

function safeNext(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) return "/ferramentas";
  return value;
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [nextPath, setNextPath] = useState("/ferramentas");

  useEffect(() => {
    const next = safeNext(new URLSearchParams(window.location.search).get("next"));
    setNextPath(next);
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) window.location.replace(next);
      })
      .catch(() => {});
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Não consegui entrar.");
        setBusy(false);
        return;
      }
      window.location.assign(nextPath);
    } catch {
      setError("Falha de rede. Tente de novo.");
      setBusy(false);
    }
  }

  return (
    <>
      <AuroraBg />
      <main className="relative min-h-screen px-5 py-16 flex items-center justify-center">
        <form onSubmit={onSubmit} className="qa-glass w-full max-w-md rounded-[28px] p-8 sm:p-10">
          <p className="text-[11px] font-bold tracking-widest text-indigo-500 mb-2">ÁREA INTERNA</p>
          <h1 className="text-3xl font-black text-slate-900">Entrar</h1>
          <p className="text-slate-500 mt-2 text-sm leading-relaxed">
            Áudio, vídeo e o gerador de criativos ficam atrás desta senha. A geração no Seedance gasta créditos.
          </p>

          <label className="block mt-8">
            <span className="text-xs font-bold tracking-wider text-slate-500">USUÁRIO</span>
            <input
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-slate-800 font-semibold outline-none focus:border-indigo-400"
              required
            />
          </label>

          <label className="block mt-4">
            <span className="text-xs font-bold tracking-wider text-slate-500">SENHA</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-slate-800 font-semibold outline-none focus:border-indigo-400"
              required
            />
          </label>

          {error && (
            <p className="mt-4 text-sm font-medium text-rose-600 bg-rose-50 rounded-2xl px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`mt-6 relative overflow-hidden w-full rounded-2xl px-6 py-3.5 font-bold text-white transition active:scale-[.98] ${
              busy ? "bg-slate-300 cursor-not-allowed" : "bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600"
            }`}
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </main>
    </>
  );
}
