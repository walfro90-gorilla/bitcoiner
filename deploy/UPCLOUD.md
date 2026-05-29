# Despliegue del worker en UpCloud (VM EU)

El worker es un proceso Node 24/7 que necesita una **IP no-US** (Binance/OKX geo-bloquean EE.UU.). UpCloud ofrece regiones EU ideales. El **dashboard** va en Vercel; aquí solo el worker (+ poller de noticias).

## 1. Crear el servidor
- UpCloud → **Deploy a Cloud Server**.
- **Región:** `de-fra1` (Frankfurt), `fi-hel1/2` (Helsinki) o `nl-ams1` (Ámsterdam) — cualquiera EU.
- **Plan:** el más pequeño basta (1 vCPU / 1–2 GB RAM).
- **SO:** Ubuntu 24.04 LTS. Añade tu llave SSH.

## 2. Instalar Node 20 + git
```bash
ssh root@TU_IP
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git
node -v   # v20.x
```

## 3. Clonar y preparar
```bash
git clone TU_REPO_GITHUB clawbot && cd clawbot
npm install
```

## 4. Variables de entorno (`.env.worker`)
Crea `.env.worker` (NO se commitea). Mínimo:
```bash
cat > .env.worker <<'EOF'
SUPABASE_URL=https://TUPROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...        # service role (Supabase → Project Settings → API)
GEMINI_API_KEY=...                   # aistudio.google.com (gratis)
LLM_PROVIDER=gemini
CRYPTOPANIC_API_KEY=                 # opcional; vacío usa Google News RSS
NEWS_POLL_MS=180000
WORKER_VENUES=binance,okx,kraken,bitso
WORKER_PAIRS=BTC/USDT,BTC/USD
MIN_NET_BPS=5
MAX_BTC_PER_TRADE=0.05
DEMO_MODE=true                       # true para que el jurado vea operaciones en vivo
EOF
```

## 5. Correr 24/7 con pm2
```bash
npm install -g pm2
pm2 start "npm run worker" --name clawbot-worker
pm2 logs clawbot-worker     # ver feeds, ejecuciones, [news]
pm2 save && pm2 startup     # arranque automático tras reboot
```

## Alternativa: Docker
```bash
docker build -t clawbot-worker .
docker run -d --restart=always --env-file .env.worker --name clawbot clawbot-worker
docker logs -f clawbot
```

## Notas
- El worker es **stateless** (estado en RAM + Supabase); reiniciarlo es seguro.
- Si añades OpenWA (WhatsApp), corre su `docker-compose` en esta misma VM (proceso persistente + sesión QR).
- Comprueba que desde la VM EU sí conectan Binance/OKX: `pm2 logs` debe mostrar `[binance:BTC/USDT] connected`.
