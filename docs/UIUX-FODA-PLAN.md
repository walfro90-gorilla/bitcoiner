# 🎨 FODA UI/UX + Plan PWA — Clawbot

> Alcance: **solo frontend y aspecto**. No se toca lógica del worker, motor, ni base de datos.
> Objetivo: que **cualquiera** entienda y maneje el dashboard, mobile-first, instalable como app (PWA),
> y que en PC se vea como una herramienta de análisis seria. Última actualización: 2026-05-30.

---

## FODA

### 🟢 Fortalezas
- Sistema de diseño coherente: tokens CSS (`--card`, `--up`/`--down`, `--accent` naranja BTC), componentes `Card`/`SectionTitle`/`Stat`/`Badge`/`InfoTip`.
- Tooltips "i" explicativos en cada tarjeta.
- Datos en vivo (realtime) con indicador `live-dot`.
- Tipografía limpia (Geist sans + mono para cifras).

### 🔴 Debilidades
- **D1** No es PWA: sin `manifest`, iconos, ni meta `theme-color`/`viewport` → no instalable.
- **D2** Sobrecarga cognitiva: ~16 tarjetas en una columna sin agrupación; el novato no sabe por dónde empezar.
- **D3** Jerga sin jerarquía de lectura (VWAP, bps, p95, depeg) — los tooltips ayudan pero hay que descubrirlos.
- **D4** Mobile pobre: tablas anchas (Oportunidades, Profundidad, Matriz) se desbordan en celular.
- **D5** Sin agrupación temática (mercado/análisis/ejecución/IA entremezclados verticalmente).
- **D6** NavBar aprieta en móvil; falta patrón bottom-nav.
- **D7** Falta "primer vistazo": no hay resumen en lenguaje humano arriba.

### 🔵 Oportunidades
- **O1** PWA instalable (manifest + SW + iconos + meta).
- **O2** Layout por secciones con encabezados (mapa mental).
- **O3** Mobile-first real: tablas→tarjetas apiladas, tap ≥44px.
- **O4** Modo Simple/Experto (oculta paneles técnicos).
- **O5** Hero/resumen con estado del bot en lenguaje humano + KPIs grandes.
- **O6** Tamaños por importancia; tablas densas colapsables.

### ⚠️ Amenazas
- **A1** No romper funcionalidad — cambios meramente visuales.
- **A2** Regresiones de build al reordenar (validar `npm run build`).
- **A3** Service worker que cachee datos en vivo (mostraría P&L stale) → cachear solo el *app shell*.
- **A4** Sobre-diseñar y perder tiempo → priorizar impacto.

---

## Plan por fases (frontend puro)

> **Estado:** Fase 1 ✅ (PWA) · Fase 2 ✅ (layout + mobile-first) · Fase 3 ⬜ (bottom-nav, toggle Simple/Experto)

### Fase 1 — PWA (instalable como app) ✅
- `app/manifest.ts` (Next genera `manifest.webmanifest`): name, short_name, theme/background color, display standalone, iconos.
- Iconos en `/public/icons/`: 192, 512 y **maskable** (generados de un SVG con el águila sobre naranja BTC).
- Meta en `layout.tsx`: `viewport` (width, initial-scale, viewport-fit cover), `themeColor`, `appleWebApp` (capable, title, status-bar).
- Service worker mínimo que cachea el **app shell** (HTML/CSS/JS/iconos) con estrategia *network-first* para no servir datos viejos; los datos en vivo siguen por Realtime/SWR.
- Verificar: build OK + Lighthouse "installable".

### Fase 2 — Layout coherente + mobile-first ✅
- Agrupar las ~16 tarjetas en **4 secciones con título**:
  1. **Resumen** — KPIs grandes + estado en lenguaje humano (hero).
  2. **Mercado en vivo** — Estado del mercado, Matriz, Profundidad.
  3. **Análisis** — Maker/Taker, Backtest, Markov, Velocidad, Anatomía, z-score.
  4. **Ejecución y P&L** — P&L, Oportunidades, Operaciones, Descartes, Estrategias, Wallets, Premio.
  5. **Inteligencia** — Noticias, Copiloto.
- Tamaños por importancia (P&L/estado grandes; tablas densas colapsables).
- Tablas → tarjetas apiladas en móvil (breakpoints), tap targets ≥44px.

### Fase 3 — Navegación + claridad
- Bottom-nav en móvil (Dashboard/Admin/Escuelita) con iconos.
- Hero de resumen "qué estoy viendo y cómo va" en una frase.
- (Opcional) toggle **Simple/Experto** que oculta paneles técnicos.

---

## Reglas de ejecución
1. Cada fase termina con `npm run build` (exit 0) antes de commit.
2. Cero cambios en `worker/`, `lib/core/` (lógica), migraciones o hooks de datos.
3. Commits pequeños por fase, en español, pusheados para que Vercel redespliegue.
