# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN node ace build --ignore-ts-errors


FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3333
ENV HOST=0.0.0.0

COPY package.json package-lock.json ./
RUN npm install --production

COPY --from=builder /app/build ./build

EXPOSE 3333
CMD ["node", "build/server.js"]
