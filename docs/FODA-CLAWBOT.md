# 🧭 FODA — Clawbot · Checklist accionable

> Análisis FODA del bot de arbitraje, convertido en checklist. Marcado `[x]` = hecho/confirmado · `[ ]` = pendiente.
> Última actualización: **2026-05-30**. Estado: desplegado (UpCloud EU + Vercel + Supabase), modo **Real**, P&L $0, 5 exchanges en vivo.

---

## 🟢 Fortalezas (estado actual confirmado)

- [x] **F1 — Arquitectura limpia worker/web/DB**: hot-path nunca toca Vercel; core TS puro reutilizado *(criterio #5)*
- [x] **F2 — Precisión neta verificada con test**: +$109.75 exacto del brief; separa gross/net *(criterio #2)*
- [x] **F3 — 5 estrategias reales** + priorización por neto: spatial, cross-quote, triangular, statistical, regional *(criterio #4)*
- [x] **F4 — Order books incrementales + checksum CRC32** validados en vivo (OKX 5/5 MATCH, Kraken 145 ticks)
- [x] **F5 — Robustez probada**: breakers, parciales, wallet guard, slippage + pruebas de estrés documentadas *(criterio #3)*
- [x] **F6 — Latencia <1 ms event-driven**, medida y mostrada (p50/p95/p99) *(criterio #1)*
- [x] **F7 — Desplegado 24/7** + dashboard rico + copiloto IA + noticias *(criterio #6)*
- [x] **F8 — Nicho diferenciador**: premio regional Bitso MX (arbitraje genuinamente rentable)
- [x] **F9 — Honestidad de ingeniería**: registra todas las oportunidades + motivo de descarte; DB al ~6% del free tier

---

## 🔴 Debilidades (mitigaciones)

- [x] ~~**D1 — Worker = punto único de fallo**~~ → `pm2 startup` + `pm2 save` hechos. **Verificado con reboot real**: el worker resucitó solo (11 feeds `age_s=0`)
- [x] ~~**D2 — `worker/` excluido del typecheck**~~ → creado `npm run check:worker` (`tsconfig.worker.json`), corre limpio (RC=0)
- [x] ~~**D4 — Admin sin auth fuerte**~~ → `ADMIN_KEY` única generada y puesta en Vercel; `.env.example` documentado
- [ ] **D3 — En Real el P&L se queda en $0** (puede *parecer* inactivo) → mitigar con **guion de pitch** + inyector + DEMO 20s
- [ ] **D5 — Triangular usa top-of-book** (no VWAP completo como las otras 4) → documentar como limitación consciente
- [ ] **D6 — Cobertura de tests parcial** (profit + crc32; falta executor/engine/risk) → opcional, mencionar como "siguiente paso"
- [x] ~~**D7 — Inyector con precios hardcoded**~~ → aceptable: etiquetado "ejemplo del reto" (didáctico, no trampa)

---

## 🔵 Oportunidades (mejoras para subir el techo)

- [ ] **O1 — Maker/taker inteligente**: modelar fills maker bajaría costos → más casos rentables *(ataca A2; alto valor)*
- [ ] **O2 — 6º–7º venue** (Coinbase, Bybit): más superficie de divergencia *(30 min c/u + redeploy)*
- [ ] **O3 — Backtest/replay** desde `book_snapshots` (infra ya existe, off) → P&L histórico *(vistoso)*
- [ ] **O4 — Métrica "oportunidades rentables perdidas por latencia"** *(narrativa potente, bajo esfuerzo)*
- [ ] **O5 — Copiloto con tool-use** (consultas arbitrarias a la DB) *(diferenciador IA)*
- [ ] **O6 — Alertas WhatsApp/Telegram** (WhatsApp se difirió) *(efecto "wow")*

---

## ⚠️ Amenazas (riesgos del día del jurado)

- [x] ~~**A1 — Feed cae / red en la VM**~~ → `staleMs` excluye feed muerto + reconexión backoff. Respaldo: screenshots
- [ ] **A2 — Mercados eficientes → 0 trades en Real** *(el más probable)* → inyector + toggle DEMO lo resuelven en vivo
- [x] ~~**A3 — VM se pausa/reinicia**~~ → `pm2 startup` + `pm2 save` + **reboot probado**: worker online sin intervención ✅
- [ ] **A4 — Supabase free se pausa** si el worker muere >7 días → no aplica si corre 24/7; **vigilar hasta la entrega**
- [x] ~~**A5 — Rate-limit/ban de un exchange**~~ → backoff exponencial (250 ms→8 s + jitter) ya implementado
- [x] ~~**A6 — Cuota Gemini/CryptoPanic agotada**~~ → fuera del hot-path; el bot sigue operando igual
- [ ] **A7 — Competidores con menor latencia/trading real** → defensa: robustez + 5 estrategias + nicho MX + checksum

---

## 🎯 URGENTES SIGUIENTES (priorizadas por ROI)

### 🔴 Ahora mismo (cierran riesgos abiertos, < 5 min)
1. [x] ~~**`pm2 save`** en la VM~~ → hecho
2. [x] ~~**Prueba de reboot**~~ → **hecha y superada**: worker resucitó solo (verificado vía DB, 11 feeds frescos)
3. [ ] **Dejar en modo Real** hasta la presentación; **resetear P&L** justo antes si hace falta *(panel admin)*

### 🟠 Antes del jurado (alto valor, no técnico)
4. [ ] **Guion de pitch 2 min** cronometrado → neutraliza **D3** (enmarca el "$0 en Real" como precisión) y **A2**
5. [ ] **Vigilar uptime** del worker hasta la entrega *(A4)*: un `pm2 list` cada cierto tiempo

### 🟡 Si queda tiempo (suben la nota técnica)
6. [ ] **O1 — Maker fills**: la mejora con mejor ROI técnico; ataca directamente A2 (más trades rentables)
7. [ ] **O3 — Replay/backtest**: muy visual, la infra (`book_snapshots`) ya existe
8. [ ] **O4 — Métrica de oportunidades perdidas**: barata y narrativamente potente
9. [ ] **D5/D6** — documentar limitación de triangular + añadir tests de executor/engine *(criterio #5)*

---

## ✅ Resumen de lo ya accionado (este sprint)
- Reset de P&L a $0 en modo **Real** (worker adoptó el cambio)
- Fix del feed **Bitstamp** (5º exchange) — verificado en vivo
- **S4** (incremental + CRC32), **S1** (tests), **S2** (honestidad README), **S3** (inyector), **S5** (Bitstamp)
- Mejoras **A1/A2/A3 + B1/B2/B3** del dashboard (mercado en vivo, matriz, latencia, priorización, depth, ejemplo)
- 3 acciones del cruce DAFO: **D2** (check:worker), **D4** (ADMIN_KEY en Vercel), **D1/A3** (pm2 startup + save + reboot probado ✅)
