# ── Stage 1 : Build ───────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npx prisma generate
RUN npm run build

# ── Stage 2 : Runtime ─────────────────────────────────────
FROM node:18-alpine

# Requis par Prisma sur Alpine Linux (libssl.so.1.1)
RUN apk add --no-cache openssl

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY package*.json ./

# Migration BDD via prisma db push puis lancement NestJS
CMD ["sh", "-c", "npx prisma db push && node dist/main"]
