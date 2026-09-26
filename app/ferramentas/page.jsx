import AuroraBg from "@/components/aurora-bg";
import ToolsNav from "@/components/tools-nav";

const TOOLS = [
  {
    href: "/criativos",
    kicker: "SEEDANCE 2.5",
    title: "Criativos",
    text: "Monta anúncios UGC em 9:16. Cada slot gera um clipe e o rosto e a voz seguem de um para o outro.",
  },
  {
    href: "/audio",
    kicker: "MID / SIDE",
    title: "Áudio",
    text: "Mistura o áudio invisível no vídeo principal, em anti-fase, direto no navegador.",
  },
  {
    href: "/video",
    kicker: "METADADOS",
    title: "Vídeo",
    text: "Tira título, data, GPS e outras tags do container, sem reencode.",
  },
];

export default function FerramentasPage() {
  return (
    <>
      <AuroraBg />
      <main className="relative min-h-screen px-5 py-12 sm:py-16">
        <div className="max-w-5xl mx-auto">
          <ToolsNav current="/ferramentas" />
          <p className="text-[11px] font-bold tracking-widest text-indigo-500 mb-2">ÁREA PROTEGIDA</p>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900">Ferramentas</h1>
          <p className="text-slate-500 mt-3 max-w-2xl">
            Tudo que entra aqui pede o mesmo login. O gerador de criativos chama a API do Replicate e consome crédito a
            cada segundo gerado.
          </p>

          <div className="mt-10 grid md:grid-cols-3 gap-5">
            {TOOLS.map((tool) => (
              <a key={tool.href} href={tool.href} className="qa-glass rounded-3xl p-6 hover:shadow-lg transition block">
                <p className="text-[11px] font-bold tracking-widest text-indigo-500">{tool.kicker}</p>
                <h2 className="mt-3 text-2xl font-black text-slate-900">{tool.title}</h2>
                <p className="mt-2 text-slate-500 text-sm leading-relaxed">{tool.text}</p>
              </a>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
