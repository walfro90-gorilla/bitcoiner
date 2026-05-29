# Worker de Clawbot (el "cerebro"). Para UpCloud / Railway / cualquier host Docker.
# El dashboard (Next.js) se despliega aparte en Vercel.
FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
# Las variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, etc.)
# se inyectan con --env-file .env.worker o -e en el runtime.
CMD ["npm", "run", "worker"]
