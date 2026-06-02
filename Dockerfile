# ---------- build stage ----------
FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---------- runtime stage ----------
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# PORT is injected by Fly at runtime (defaults to 8080)
EXPOSE 8080

CMD ["node", "server/server.js"]
