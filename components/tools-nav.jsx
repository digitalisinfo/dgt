"use client";

import { useState } from "react";

const LINKS = [
  ["/ferramentas", "Início"],
  ["/audio", "Áudio"],
  ["/video", "Vídeo"],
  ["/criativos", "Criativos"],
];

export default function ToolsNav({ current }) {
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    setLeaving(true);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
      <a href="/ferramentas" className="font-extrabold tracking-tight text-slate-900">
        Ferramentas
      </a>
      <nav className="flex flex-wrap items-center gap-1.5">
        {LINKS.map(([href, label]) => (
          <a
            key={href}
            href={href}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              current === href ? "bg-indigo-600 text-white" : "text-slate-600 hover:text-indigo-600"
            }`}
          >
            {label}
          </a>
        ))}
      </nav>
      <button
        type="button"
        onClick={logout}
        disabled={leaving}
        className="text-sm font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-60"
      >
        {leaving ? "Saindo…" : "Sair"}
      </button>
    </div>
  );
}
