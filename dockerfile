# =====================
# Build stage
# =====================
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# ✅ Adonis v6 build (TANPA --production)
RUN node ace build

# =====================
# Runtime stage
# =====================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3333

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3333

# ⬇️ ENTRYPOINT PALING AMAN UNTUK ADONIS V6
CMD ["node", "build/bin/server.js"]