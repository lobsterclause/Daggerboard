FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm run lint

FROM node:20-alpine

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server.ts ./

RUN npm ci --omit=dev
RUN npm install -g tsx

EXPOSE 3000
EXPOSE 4318

ENV NODE_ENV=production
CMD ["tsx", "server.ts"]
