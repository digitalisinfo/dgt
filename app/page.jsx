"use client";

import { useEffect, useState } from "react";

/* ── Marca SVG animada (rede neural "nodo") ── */
function Mark({ uid, size = 24, animated = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="45%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id={`g2-${uid}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <radialGradient id={`core-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#4f46e5" />
        </radialGradient>
      </defs>
      <path
        className={animated ? "qa-mark-draw" : ""}
        d="M9 33 L18 24 L27 28 L39 13"
        stroke={`url(#g-${uid})`}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle className={animated ? "qa-mark-node qa-mark-node-1" : ""} cx="9" cy="33" r="3.4" fill={`url(#g2-${uid})`} />
      <circle className={animated ? "qa-mark-node qa-mark-node-2" : ""} cx="18" cy="24" r="3" fill={`url(#g-${uid})`} />
      <circle className={animated ? "qa-mark-node qa-mark-node-3" : ""} cx="27" cy="28" r="3" fill={`url(#g2-${uid})`} />
      <circle className={animated ? "qa-mark-node qa-mark-node-4" : ""} cx="39" cy="13" r="4" fill={`url(#core-${uid})`} />
    </svg>
  );
}

const ARROW = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

const CHECK = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const MAIL = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const PIN = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#94a3b8"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="mt-0.5 flex-shrink-0"
  >
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const MARQUEE_ITEMS = [
  "INFOPRODUCTS",
  "ONLINE COURSES",
  "DIGITAL MARKETING",
  "OWN PLATFORMS",
  "ONLINE EDUCATION",
  "DIGITAL DISTRIBUTION",
];

function MarqueeRow({ hidden }) {
  return (
    <div className="flex items-center" aria-hidden={hidden ? "true" : undefined}>
      {MARQUEE_ITEMS.map((t, i) => (
        <span key={i} className="flex items-center gap-2 px-6">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
          <span className="text-[12px] font-semibold tracking-wider text-slate-500">{t}</span>
        </span>
      ))}
    </div>
  );
}

const PILLARS = [
  {
    title: "Creation",
    grad: "from-indigo-500 to-violet-600",
    shadow: "rgba(99,102,241,.6)",
    desc: "We develop original infoproducts and educational content, with topic curation, scripting, and production designed to deliver real value.",
    icon: (
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
    ),
  },
  {
    title: "Marketing",
    grad: "from-violet-500 to-fuchsia-600",
    shadow: "rgba(139,92,246,.6)",
    desc: "We take products to market with digital marketing strategies, sales funnels, and performance-driven traffic acquisition.",
    icon: (
      <>
        <path d="m3 11 18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </>
    ),
  },
  {
    title: "Distribution",
    grad: "from-cyan-500 to-blue-600",
    shadow: "rgba(6,182,212,.6)",
    desc: "We deliver through our own platforms, with immediate access, international scale, and user experience as a priority.",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </>
    ),
  },
];

const SOLUTIONS = [
  {
    title: "Infoproducts",
    desc: "E-books, guides, mentorships, and digital products that package knowledge in a practical, accessible way.",
    icon: <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />,
  },
  {
    title: "Educational content",
    desc: "Online courses and learning paths, with simple language and a focus on results for those just getting started.",
    icon: (
      <>
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c3 3 9 3 12 0v-5" />
      </>
    ),
  },
  {
    title: "Own platforms",
    desc: "Technology infrastructure built in-house to host, deliver, and scale products securely.",
    icon: (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
  },
  {
    title: "Digital marketing",
    desc: "Traffic acquisition, conversion funnels, and continuous optimization to connect each product to the right audience.",
    icon: (
      <>
        <path d="m3 11 18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </>
    ),
  },
];

const DIFERENCIAIS = [
  ["End-to-end cycle", "creation, sales, and delivery under one roof."],
  ["Own platforms", "no reliance on third parties to scale."],
  ["Data-driven marketing", "decisions based on real metrics."],
  ["Latin reach", "content adapted to the market's reality."],
];

const MERCADO = [
  ["🌎 LatAm", "Audience across Latin America"],
  ["100% Online", "Digital delivery, immediate access"],
  ["Spanish", "Content in the customer's language"],
  ["24/7", "Available anytime"],
];

const VALORES = [
  {
    title: "Mission",
    grad: "from-indigo-500 to-violet-600",
    desc: "To democratize access to knowledge through high-quality, accessible, and transformative digital products.",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
  },
  {
    title: "Vision",
    grad: "from-violet-500 to-fuchsia-600",
    desc: "To be a benchmark in digital education across Latin America, combining proprietary technology and relevant content at scale.",
    icon: (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  {
    title: "Values",
    grad: "from-cyan-500 to-blue-600",
    desc: "Transparency, innovation, customer focus, and a commitment to delivering real value in every product.",
    icon: <path d="M12 2 4 5v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V5z" />,
  },
];

const NAV_LINKS = [
  ["#empresa", "Company"],
  ["#solucoes", "Solutions"],
  ["#mercado", "Market"],
  ["#valores", "Values"],
  ["#contato", "Contact"],
];

export default function DigitalisPage() {
  const [scrolled, setScrolled] = useState(false);
  const [year, setYear] = useState("");

  useEffect(() => {
    setYear(String(new Date().getFullYear()));

    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, []);

  return (
    <>
      {/* ═══════════════ FUNDO AURORA ═══════════════ */}
      <div className="fixed inset-0 pointer-events-none -z-10 aurora-gradient" />
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="qa-blob qa-blob-a" />
        <div className="qa-blob qa-blob-b" />
        <div className="qa-blob qa-blob-c" />
      </div>
      <div className="fixed inset-0 pointer-events-none -z-10 aurora-grid" />
      <div className="qa-noise fixed inset-0 pointer-events-none -z-10" />

      {/* ═══════════════ NAVBAR ═══════════════ */}
      <header className="fixed top-0 inset-x-0 z-50">
        <div className="max-w-6xl mx-auto px-5">
          <div
            className={`mt-3 rounded-2xl qa-glass px-4 sm:px-5 py-3 flex items-center justify-between transition-shadow duration-300 ${
              scrolled ? "shadow-lg" : ""
            }`}
          >
            <a href="#top" className="flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-xl bg-white/70 border border-white/70 flex items-center justify-center shadow-sm">
                <Mark uid="nav" size={24} />
              </span>
              <span className="font-extrabold text-lg tracking-tight text-slate-900 leading-none">
                Digitalis <span className="text-slate-400 font-semibold">Infoproducts</span>
              </span>
            </a>

            <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
              {NAV_LINKS.map(([href, label]) => (
                <a key={href} href={href} className="hover:text-indigo-600 transition-colors">
                  {label}
                </a>
              ))}
            </nav>

            <a
              href="#contato"
              className="relative overflow-hidden rounded-xl px-4 py-2.5 text-sm font-bold text-white flex items-center gap-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 shadow-[0_12px_28px_-10px_rgba(99,102,241,.6)] active:scale-95 transition"
            >
              <span className="qa-shine" />
              <span className="relative z-10">Get in touch</span>
            </a>
          </div>
        </div>
      </header>

      <main id="top" className="relative">
        {/* ═══════════════ HERO ═══════════════ */}
        <section className="pt-36 sm:pt-40 pb-20 px-5">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full qa-glass-soft mb-6 qa-rise">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-600 text-xs font-semibold tracking-wide">
                DIGITAL PRODUCTS · ONLINE EDUCATION · LATIN MARKET
              </span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-black leading-[1.08] tracking-tight text-slate-900 qa-rise qa-d1">
              We turn knowledge into <span className="gradient-text">digital products</span> that educate and scale
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-slate-500 max-w-2xl mx-auto qa-rise qa-d2">
              <strong className="text-slate-700 font-semibold">Digitalis Infoproducts</strong> creates, markets, and
              distributes infoproducts and online educational content through its own platforms and digital marketing,
              serving customers across Latin America.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3.5 qa-rise qa-d3">
              <a
                href="#contato"
                className="relative overflow-hidden w-full sm:w-auto rounded-2xl px-8 py-4 text-lg font-bold text-white flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 shadow-[0_18px_40px_-10px_rgba(99,102,241,.6)] active:scale-[.98] transition"
              >
                <span className="qa-shine" />
                <span className="relative z-10 flex items-center gap-3">
                  Become a partner
                  {ARROW}
                </span>
              </a>
              <a
                href="#solucoes"
                className="w-full sm:w-auto rounded-2xl px-8 py-4 text-lg font-bold text-slate-700 flex items-center justify-center gap-2 qa-glass active:scale-[.98] transition"
              >
                Explore our solutions
              </a>
            </div>

            <div className="mt-12 grid grid-cols-3 gap-3 max-w-2xl mx-auto qa-rise qa-d4">
              {[
                ["100%", "Digital & scalable"],
                ["LatAm", "Latin market focus"],
                ["Online", "Immediate access"],
              ].map(([big, small]) => (
                <div key={big} className="qa-glass-soft rounded-2xl py-4">
                  <div className="text-2xl sm:text-3xl font-black gradient-text qa-tnum">{big}</div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5">{small}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ MARQUEE ═══════════════ */}
        <section className="px-5 pb-4">
          <div className="max-w-6xl mx-auto">
            <div className="qa-glass-soft rounded-full overflow-hidden py-3 relative">
              <div
                className="absolute inset-y-0 left-0 w-16 z-10 pointer-events-none"
                style={{ background: "linear-gradient(90deg,rgba(255,255,255,.9),transparent)" }}
              />
              <div
                className="absolute inset-y-0 right-0 w-16 z-10 pointer-events-none"
                style={{ background: "linear-gradient(270deg,rgba(255,255,255,.9),transparent)" }}
              />
              <div className="qa-marquee-track">
                <MarqueeRow />
                <MarqueeRow hidden />
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ A EMPRESA / 3 PILARES ═══════════════ */}
        <section id="empresa" className="py-20 px-5">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12 reveal">
              <p className="text-[11px] font-bold tracking-widest text-indigo-500 mb-2">THE COMPANY</p>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight">
                An end-to-end digital operation
              </h2>
              <p className="text-slate-500 mt-3 max-w-2xl mx-auto">
                We handle the entire digital product lifecycle — from idea to final delivery — with our own technology
                and acquisition strategy.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-5">
              {PILLARS.map((p, i) => (
                <div key={p.title} className="qa-glass rounded-3xl p-7 reveal" style={{ transitionDelay: `${i * 0.08}s` }}>
                  <div
                    className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${p.grad} flex items-center justify-center`}
                    style={{ boxShadow: `0 14px 30px -10px ${p.shadow}` }}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {p.icon}
                    </svg>
                  </div>
                  <h3 className="mt-5 text-xl font-black text-slate-900">{p.title}</h3>
                  <p className="mt-2 text-slate-500 leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ SOLUÇÕES ═══════════════ */}
        <section id="solucoes" className="py-20 px-5">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12 reveal">
              <p className="text-[11px] font-bold tracking-widest text-indigo-500 mb-2">WHAT WE OFFER</p>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight">Complete digital solutions</h2>
              <p className="text-slate-500 mt-3 max-w-2xl mx-auto">
                A portfolio built to educate, engage, and convert — from the first touch to content access.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              {SOLUTIONS.map((s, i) => (
                <div
                  key={s.title}
                  className="qa-glass-soft rounded-3xl p-7 flex items-start gap-5 reveal"
                  style={{ transitionDelay: `${(i % 2) * 0.06}s` }}
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 flex items-center justify-center flex-shrink-0 border border-white">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {s.icon}
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{s.title}</h3>
                    <p className="text-slate-500 mt-1 text-[15px] leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ DIFERENCIAIS ═══════════════ */}
        <section className="py-10 px-5">
          <div className="max-w-6xl mx-auto">
            <div className="qa-glass rounded-3xl p-8 sm:p-10 relative overflow-hidden reveal">
              <div
                className="absolute -top-16 -right-16 w-64 h-64 rounded-full"
                style={{ background: "radial-gradient(circle,rgba(99,102,241,.18),transparent 70%)" }}
              />
              <div className="relative grid sm:grid-cols-2 gap-8 items-center">
                <div>
                  <p className="text-[11px] font-bold tracking-widest text-indigo-500 mb-2">WHY DIGITALIS</p>
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                    Proprietary technology, a performance focus, and international scale
                  </h2>
                  <p className="text-slate-500 mt-3 leading-relaxed">
                    We combine content creation, platform engineering, and data-driven marketing to run digital products
                    with predictability and efficiency.
                  </p>
                </div>
                <ul className="space-y-4">
                  {DIFERENCIAIS.map(([strong, rest]) => (
                    <li key={strong} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        {CHECK}
                      </span>
                      <span className="text-slate-700">
                        <strong className="font-semibold text-slate-800">{strong}</strong> — {rest}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ MERCADO ═══════════════ */}
        <section id="mercado" className="py-20 px-5">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12 reveal">
              <p className="text-[11px] font-bold tracking-widest text-indigo-500 mb-2">OUR MARKET</p>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight">Built for Latin America</h2>
              <p className="text-slate-500 mt-3 max-w-2xl mx-auto">
                We operate mainly in Latin countries, with products and communication adapted to the region's culture,
                language, and needs.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {MERCADO.map(([big, small], i) => (
                <div key={big} className="qa-glass-soft rounded-2xl p-6 text-center reveal" style={{ transitionDelay: `${i * 0.06}s` }}>
                  <div className="text-2xl font-black gradient-text">{big}</div>
                  <p className="text-slate-500 text-sm mt-2">{small}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ MISSÃO / VISÃO / VALORES ═══════════════ */}
        <section id="valores" className="py-20 px-5">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12 reveal">
              <p className="text-[11px] font-bold tracking-widest text-indigo-500 mb-2">OUR ESSENCE</p>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight">Mission, vision &amp; values</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              {VALORES.map((v, i) => (
                <div key={v.title} className="qa-glass rounded-3xl p-7 reveal" style={{ transitionDelay: `${i * 0.08}s` }}>
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${v.grad} flex items-center justify-center`}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {v.icon}
                    </svg>
                  </div>
                  <h3 className="mt-5 text-lg font-black text-slate-900">{v.title}</h3>
                  <p className="mt-2 text-slate-500 leading-relaxed">{v.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ CTA / CONTATO ═══════════════ */}
        <section id="contato" className="py-20 px-5">
          <div className="max-w-4xl mx-auto">
            <div className="qa-glass rounded-[32px] p-8 sm:p-12 text-center relative overflow-hidden reveal">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(ellipse 60% 50% at 50% 0%,rgba(99,102,241,.12),transparent 70%)" }}
              />
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl qa-glass flex items-center justify-center mx-auto mb-5">
                  <Mark uid="cta" size={34} />
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight">
                  Let's build something <span className="gradient-text">digital</span> together
                </h2>
                <p className="text-slate-500 mt-3 max-w-xl mx-auto text-lg">
                  Interested in partnerships, distribution, or content collaboration? Talk to our team.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5">
                  <a
                    href="mailto:contato@digitalisinfo.com"
                    className="relative overflow-hidden w-full sm:w-auto rounded-2xl px-8 py-4 text-lg font-bold text-white flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 shadow-[0_18px_40px_-10px_rgba(99,102,241,.6)] active:scale-[.98] transition"
                  >
                    <span className="qa-shine" />
                    <span className="relative z-10 flex items-center gap-3">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                      Send email
                    </span>
                  </a>
                  <a
                    href="#top"
                    className="w-full sm:w-auto rounded-2xl px-8 py-4 text-lg font-bold text-slate-700 flex items-center justify-center gap-2 qa-glass-soft active:scale-[.98] transition"
                  >
                    Back to top
                  </a>
                </div>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-slate-500 text-sm">
                  <span className="flex items-center gap-2">{MAIL} contato@digitalisinfo.com</span>
                  <span className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    Remote-first · Serving Latin America
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="px-5 pb-10">
        <div className="max-w-6xl mx-auto">
          <div className="qa-glass-soft rounded-3xl p-8 sm:p-10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-xl bg-white/70 border border-white/70 flex items-center justify-center shadow-sm">
                  <Mark uid="ft" size={26} animated={false} />
                </span>
                <div>
                  <div className="font-extrabold text-slate-900 leading-none">Digitalis Infoproducts</div>
                  <div className="text-slate-400 text-sm mt-1">Digital products &amp; online education</div>
                </div>
              </div>

              <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-slate-500">
                {NAV_LINKS.map(([href, label]) => (
                  <a key={href} href={href} className="hover:text-indigo-600 transition-colors">
                    {label}
                  </a>
                ))}
              </nav>
            </div>

            <div className="h-px bg-slate-200/70 my-7" />

            <div className="grid sm:grid-cols-2 gap-5 text-slate-400 text-xs">
              <address className="not-italic leading-relaxed flex items-start gap-2.5">
                {PIN}
                <span>
                  <span className="font-semibold text-slate-600">Digitalis Infoproducts LLC</span> · United States
                  <br />
                  525 Randall Ave, Ste 100 – 1294
                  <br />
                  Cheyenne, WY 82001
                </span>
              </address>

              <address className="not-italic leading-relaxed flex items-start gap-2.5">
                {PIN}
                <span>
                  <span className="font-semibold text-slate-600">Digitalis Infoprodutos Ltda</span> · Brazil
                  <br />
                  CNPJ: 66.460.120/0001-80
                  <br />
                  Rua Washington Luís, 59 · Centro
                  <br />
                  Nossa Senhora das Graças – PR, 86680-000
                  <br />
                  Phone:{" "}
                  <a href="tel:+5583986039538" className="hover:text-indigo-600 transition-colors">
                    +55 83 98603-9538
                  </a>
                </span>
              </address>
            </div>

            <div className="mt-6 pt-5 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-slate-400 text-xs">
              <p>© {year} Digitalis Infoproducts. All rights reserved.</p>
              <p>Digital company serving customers across Latin America.</p>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
