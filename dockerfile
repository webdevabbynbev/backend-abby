# =====================
# Build stage
# =====================
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build Adonis v6
RUN node ace build

# =====================
# Runtime stage
# =====================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3333

# Copy hasil build
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# ⬇️ INI KUNCI UTAMA (WAJIB ADA)
# Rename .env.production → .env agar dibaca Adonis
COPY --from=builder /app/.env.production /app/.env
COPY --from=builder /app/.env.production /app/build/.env


WORKDIR /app/build

EXPOSE 3333
CMD ["node", "bin/server.js"]
