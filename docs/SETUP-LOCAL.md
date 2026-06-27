# Setup en máquina nueva / cambio de laptop

> Para arrancar este repo en otra computadora (y para que Claude Code entienda el contexto allá).
> El **código viaja por git**; los **secretos y la memoria de Claude NO**. Esta guía cubre lo que falta.

## 1. Requisitos
- **Node 20.x** (probado con v20.18.0, npm 10.8.2). Git.
- Clona el repo donde quieras (p.ej. `C:\Codes\bitcoiner`). El código funciona desde cualquier ruta. La ruta **solo** importa si quieres reusar la auto-memoria de Claude Code del laptop viejo (ver §5). Si el laptop nuevo no tiene disco `X:`, ignóralo: clona en `C:\` y listo.

## 2. Secretos (NO están en git — `.env*` está en `.gitignore`)
Cópialos del laptop viejo, o recréalos desde `.env.example` con las llaves reales:

| Archivo | Para qué | De dónde sacar las llaves |
|---|---|---|
| `.env.local` | Web / Next.js (dev local) | Supabase (URL + anon + service_role), Groq (`OPENAI_API_KEY=gsk_...`) |
| `.env.worker` | Worker (corre en la VM, no local) | mismas de Supabase + LLM |
| `.env.supabase` | acceso SQL (PAT de Supabase) | token personal de Supabase |

En producción estas viven en **Vercel** (web) y en **`~/clawbot/.env.worker`** de la VM (worker) — el laptop nuevo no las necesita para eso, solo para correr en local.

## 3. Arrancar en local
```bash
npm install
npm run dev        # http://localhost:3000
```
Otros: `npm test` · `npm run build` · `npm run worker` (worker en local, raro) · `npm run check:worker`.

## 4. Muro "En construcción" 🦍 (estado actual)
El sitio está **amurallado**: `proxy.ts` reescribe TODO a `/maintenance` (pantalla del gorila 8-bit de GorillaLabs).
- **Apagar el muro:** `MAINTENANCE=off` en `.env.local` (o en Vercel para prod).
- **Espiar el sitio real sin apagarlo:** entra con `?llave=gorila` (cookie 7 días). Cambia la clave con `MAINTENANCE_KEY`.
- Archivos: [`proxy.ts`](../proxy.ts) y [`app/maintenance/page.tsx`](../app/maintenance/page.tsx).

## 5. Memoria de Claude Code (opcional, para continuidad)
No viaja por git. **Si no la copias, no pasa nada:** Claude entiende el proyecto leyendo `AGENTS.md`, `README.md` y este `docs/`. La reconstruye con el uso.

Si quieres conservarla, el truco es que la carpeta se nombra según la ruta del proyecto (los `:` y `\` se vuelven `-`). En el laptop viejo está en `~/.claude/projects/x--Codes-bitcoiner/memory/`.
- **Clonaste en `C:\Codes\bitcoiner`** (sin disco X:) → abre Claude Code ahí una vez; se creará `C:\Users\<usuario>\.claude\projects\c--Codes-bitcoiner\`. Copia el `memory/` viejo dentro de esa.
- **Quieres la ruta exacta `X:` sin tener disco X:** → `subst X: C:\Codes` crea un X: falso apuntando a una carpeta real; luego clona en `X:\Codes\bitcoiner`. (`subst` se borra al reiniciar; re-córrelo o ponlo en un script de inicio.)

## 6. Deploy / worker (referencia)
- **Web:** Vercel (import del repo). `worker/` se ignora vía `.vercelignore`.
- **Worker:** VM UpCloud (Frankfurt), `root@94.237.99.158`, repo en `~/clawbot`, pm2 como `clawbot-worker`. Redeploy: `cd ~/clawbot && git pull && pm2 restart all`.
