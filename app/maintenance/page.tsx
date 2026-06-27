import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GorillaLabs — En construcción',
  robots: { index: false, follow: false },
};

// ── Gorila 8-bit (con casco de obra) — sprite 16×16 generado por código ──────
// '.' transparente. Cada letra = un color de la paleta de abajo.
const SPRITE = [
  '......YYYY......',
  '....YYYYYYYY....',
  '...YYYYYYYYYY...',
  '...YYoYYYYoYY...',
  '.YYYYYYYYYYYYYY.',
  '...KGGGGGGGGK...',
  '..GKFFFFFFFFKG..',
  '.GGKFWPFFPWFKGG.',
  '.GGKFFFFFFFFKGG.',
  '..KFFMMMMMMFFK..',
  '..KFMMNMMNMMFK..',
  '...KFMMMMMMFK...',
  '....KKFFFFKK....',
  '...KGGGGGGGGK...',
  '..GGGGGGGGGGGG..',
  '.GG.GGGGGGGG.GG.',
];

const COLORS: Record<string, string> = {
  Y: '#ffd23f', // casco
  o: '#e0a400', // sombra casco
  K: '#1e1a24', // contorno / pelo oscuro
  G: '#5b5666', // pelaje
  F: '#7d7787', // cara
  M: '#a89a8c', // hocico
  W: '#ffffff', // ojo
  P: '#1e1a24', // pupila
  N: '#3a3340', // fosa nasal
};

function Gorilla() {
  const rects = [];
  for (let r = 0; r < SPRITE.length; r++) {
    for (let c = 0; c < SPRITE[r].length; c++) {
      const ch = SPRITE[r][c];
      if (ch === '.') continue;
      rects.push(
        <rect
          key={`${r}-${c}`}
          x={c}
          y={r}
          width={1.02}
          height={1.02}
          fill={COLORS[ch]}
          className={ch === 'P' ? 'gl-pupil' : undefined}
        />,
      );
    }
  }
  return (
    <svg
      viewBox="0 0 16 16"
      width="200"
      height="200"
      shapeRendering="crispEdges"
      className="gl-gorilla"
      aria-label="Gorila en construcción"
      role="img"
    >
      {rects}
    </svg>
  );
}

export default function Maintenance() {
  const year = 2026; // ponytail: estático; new Date() no aporta nada aquí

  return (
    <div className="gl-wrap">
      {/* franja de peligro */}
      <div className="gl-hazard" />

      <main className="gl-stage">
        <p className="gl-brand">🦍 GORILLA<span>LABS</span></p>

        <div className="gl-podium">
          <Gorilla />
          <div className="gl-shadow" />
        </div>

        <h1 className="gl-title">EN CONSTRUCCIÓN</h1>
        <p className="gl-sub">Estamos forjando algo brutal. Vuelve pronto. 🔨</p>

        <div className="gl-bar" aria-hidden>
          <div className="gl-fill" />
        </div>
        <p className="gl-pct">DESPLEGANDO MEJORAS… 87%</p>

        <p className="gl-status"><span className="gl-dot" /> SISTEMA EN MANTENIMIENTO</p>
      </main>

      <footer className="gl-foot">© {year} GorillaLabs · Construyendo el futuro, pixel a pixel.</footer>

      {/* franja de peligro */}
      <div className="gl-hazard" />

      {/* CRT scanlines encima de todo */}
      <div className="gl-scan" aria-hidden />

      <style>{`
        .gl-wrap{
          position:fixed; inset:0; z-index:9999;
          display:flex; flex-direction:column; align-items:stretch;
          overflow:auto;
          background:
            radial-gradient(120% 90% at 50% 0%, #161b29 0%, #0b0e14 55%, #07090f 100%);
          color:#e6e8ef;
          font-family: var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace;
          -webkit-font-smoothing:antialiased;
        }
        .gl-hazard{
          height:14px; flex:0 0 14px;
          background:repeating-linear-gradient(45deg,#ffd23f 0 16px,#1e1a24 16px 32px);
          background-size:45px 45px;
          animation:gl-slide 1.2s linear infinite;
          box-shadow:0 0 24px rgba(255,210,63,.25);
        }
        @keyframes gl-slide{ to{ background-position:45px 0 } }

        .gl-stage{
          flex:1 1 auto;
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          gap:14px; text-align:center; padding:32px 20px;
        }
        .gl-brand{
          margin:0; font-size:14px; letter-spacing:.55em; padding-left:.55em;
          color:#aab1c4; text-transform:uppercase;
        }
        .gl-brand span{ color:#ffd23f }

        .gl-podium{ position:relative; display:flex; flex-direction:column; align-items:center }
        .gl-gorilla{
          image-rendering:pixelated;
          filter:drop-shadow(0 0 26px rgba(255,210,63,.28));
          animation:gl-bob 2.6s ease-in-out infinite;
        }
        @keyframes gl-bob{ 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-7px) } }
        .gl-pupil{ animation:gl-blink 4.5s steps(1,end) infinite }
        @keyframes gl-blink{ 0%,93%,100%{ opacity:1 } 96%{ opacity:0 } }
        .gl-shadow{
          width:120px; height:14px; margin-top:-6px; border-radius:50%;
          background:radial-gradient(closest-side,rgba(0,0,0,.55),transparent);
          animation:gl-squish 2.6s ease-in-out infinite;
        }
        @keyframes gl-squish{ 0%,100%{ transform:scale(1) } 50%{ transform:scale(.8) } }

        .gl-title{
          margin:6px 0 0; font-size:clamp(28px,7vw,52px); font-weight:800;
          letter-spacing:.14em; color:#fff;
          text-shadow:0 0 18px rgba(255,210,63,.35), 3px 3px 0 #1e1a24;
        }
        .gl-sub{ margin:0; max-width:34ch; color:#aab1c4; font-size:15px; line-height:1.5 }

        .gl-bar{
          width:min(440px,82vw); height:18px; margin-top:10px; padding:3px;
          border:2px solid #2a2f3e; border-radius:4px; background:#0e1220;
          box-shadow:inset 0 0 0 1px #000;
        }
        .gl-fill{
          height:100%; width:87%; border-radius:2px;
          background:repeating-linear-gradient(45deg,#ffd23f 0 12px,#e0a400 12px 24px);
          background-size:34px 34px;
          animation:gl-slide 1s linear infinite;
          box-shadow:0 0 14px rgba(255,210,63,.5);
        }
        .gl-pct{ margin:0; font-size:12px; letter-spacing:.2em; color:#7d8499 }

        .gl-status{
          margin:8px 0 0; display:flex; align-items:center; gap:9px;
          font-size:12px; letter-spacing:.25em; color:#9aa2b6;
        }
        .gl-dot{
          width:9px; height:9px; border-radius:50%; background:#36d399;
          box-shadow:0 0 10px #36d399; animation:gl-pulse 1.4s ease-in-out infinite;
        }
        @keyframes gl-pulse{ 0%,100%{ opacity:1 } 50%{ opacity:.25 } }

        .gl-foot{
          flex:0 0 auto; text-align:center; padding:14px;
          font-size:11px; letter-spacing:.12em; color:#5b6478;
        }

        .gl-scan{
          position:fixed; inset:0; pointer-events:none; z-index:1; opacity:.5;
          background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px);
          mix-blend-mode:multiply;
        }
        @media (prefers-reduced-motion:reduce){
          .gl-gorilla,.gl-shadow,.gl-fill,.gl-hazard,.gl-dot,.gl-pupil{ animation:none }
        }
      `}</style>
    </div>
  );
}
