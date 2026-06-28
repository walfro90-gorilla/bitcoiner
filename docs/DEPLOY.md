# 🚀 DEPLOY.md — Despliegue de Bitcoiner

> Flujo real usado (verificado). 3 piezas: **web (Vercel)**, **worker (VM UpCloud)**, **DB (Supabase)**.
> El sitio está **amurallado** por defecto (ver [bitcoiner-maintenance-wall] / `proxy.ts`): el público ve la
> página "En construcción"; tú ves el dashboard real con `?llave=gorila`. **No desactivar el muro** hasta el día de la entrega.

## Web (Vercel) — auto-deploy desde `main`
- Proyecto `bitcoiner` (team `wals-projects-a7eafbb2`), alias prod **`bitcoiner-three.vercel.app`**.
- **Push a `main` ⇒ Vercel construye y despliega automáticamente** (GitHub integration). No requiere acción manual.
- El muro sigue arriba porque la env **`MAINTENANCE`** en Vercel **no** está en `off`. No la toques.
- **Verificar el deploy** (vía MCP de Vercel): `list_deployments` → el último commit debe quedar `state: READY`. Si `ERROR`, `get_deployment_build_logs(errorsOnly:true)`.
  - ⚠️ **Gotcha de build:** ningún archivo que el `tsconfig.json` (web) type-checkee puede importar de `worker/` (excluido en Vercel vía `.vercelignore`). Por eso `scripts/` está fuera del tsconfig web y dentro de `tsconfig.worker.json`.

## Worker (VM UpCloud Frankfurt) — manual
```bash
ssh bitcoiner 'cd ~/clawbot && git pull --ff-only origin main && pm2 restart clawbot-worker'
ssh bitcoiner 'bash -lc "pm2 logs clawbot-worker --lines 40 --nostream"'   # verificar arranque
```
- La VM se corre **on-demand** (encender en la consola de UpCloud antes de demos/jurado).
- El worker **no** usa deps nuevas de la web (lightweight-charts es web-only) → no hace falta `npm install` para un redeploy normal.
- Las migraciones (Supabase) se aplican aparte (MCP `supabase-bitcoiner` `apply_migration`); el código del worker tolera columnas/tablas nuevas con defaults neutros.

## Secuencia de un release
1. Trabajar en una rama (`feat/*`), verde: `npm test` + `npm run check:worker` + `npm run build` (+ `npm run stress`).
2. Aplicar migraciones nuevas a la DB (MCP) — idempotentes y aditivas.
3. Merge a `main` (`--ff-only`) + `git push` → Vercel auto-despliega la web (tras el muro).
4. Redeploy del worker en la VM (comando de arriba).
5. **QA:** muro arriba sin llave; dashboard nuevo con `?llave=gorila`; worker escribiendo (MCP: `market_ticks`/`candles` frescos); `pm2 list` online.

## Verificación rápida (sin secretos)
- Web: `curl -s https://bitcoiner-three.vercel.app/ | grep -i construcc` (muro) · con cookie de `?llave=gorila` → dashboard.
- Worker/DB: MCP `supabase-bitcoiner` `execute_sql` → frescura de `market_ticks`/`opportunities`/`candles` (ver [`PRUEBAS-ESTRES.md`](PRUEBAS-ESTRES.md) y la técnica anon-REST).
