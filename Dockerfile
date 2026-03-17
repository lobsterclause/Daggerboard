FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm run lint

FROM node:20-alpine

WORKDIR /app

# Copy build artifacts and source files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/init-surreal.surql ./

# Copy initialization scripts
COPY docker/surreal-init.sh /app/surreal-init.sh
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/surreal-init.sh /app/entrypoint.sh

# Install runtime dependencies
RUN npm ci --omit=dev
RUN npm install -g tsx

# Install curl for health checks and surreal CLI for init
RUN apk add --no-cache curl

EXPOSE 3000
EXPOSE 4318

ENV NODE_ENV=production

ENTRYPOINT ["/app/entrypoint.sh"]
