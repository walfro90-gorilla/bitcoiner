# 📌 Nota rápida — día de la prueba (Supabase / consumo)

> Archivo local de apoyo (no crítico). Resumen de qué hacer el día del jurado respecto a Supabase.

## Estado actual (optimizado, gratis)
- `opportunities` **fuera de Realtime** (era el 99% del tráfico: ~37,000 escrituras/hora → ~2/hora ahora).
- Siguen en Realtime instantáneo: **trades, wallets, bot_state, news_signals** → el P&L, ejecuciones y DEMO se ven EN VIVO.
- La tabla "Oportunidades detectadas" se refresca por polling cada 60s (imperceptible en demo; en DEMO se llena rápido igual).
- DB sana (~128 MB / 500 MB). Lo que se excedió fue **tráfico** (Egress 149%, Realtime msgs 146%), no tamaño.

## El ciclo NO se resetea a tiempo
- Reset del ciclo Free ≈ **29 de cada mes** (org creada ~29 may). La prueba es antes → el contador seguirá "excedido" este ciclo.
- Confirmar fecha exacta en: Supabase Dashboard → org Gorilla Labs → **Settings → Billing** ("Current billing cycle").

## Plan para el día de la prueba
1. **Por defecto (gratis):** dejar como está. El consumo ya cayó >99%, el throttling residual casi no afecta la demo.
2. **Revisar la víspera:** Supabase Dashboard → **Settings → Usage**. Si Egress/Realtime **dejó de subir** → OK sin pagar.
3. **Seguro opcional ($25):** si el día de la prueba hay throttling (dashboard lento), pagar **Pro** esa mañana → límites altos + cobra excedente en vez de restringir. Cancelable después (prorrateado).

## Si pagas Pro: reactivar realtime completo (1 comando, sin git)
```sql
alter publication supabase_realtime add table opportunities;
```
(pídeme que lo corra, o vía SQL Editor de Supabase). Revertir:
```sql
alter publication supabase_realtime drop table opportunities;
```

## Plan B de demo (a prueba de fallos, independiente de Supabase)
- Botón **🧬 Reproducir ejemplo** + toggle **DEMO** generan actividad al instante (van por trades/bot_state, que siguen en realtime).
- Tener screenshots/GIF de respaldo (ver `docs/PITCH.md` → plan de contingencia).

## Monitoreo
- `powershell -File scripts/monitor-usage.ps1` (local, no commiteado) — escrituras/hora por tabla + tamaño DB.
- Fuente real del throttling: Supabase Dashboard → Settings → Usage (refresca hasta 1h).
