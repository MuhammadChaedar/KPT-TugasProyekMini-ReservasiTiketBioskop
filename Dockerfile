FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && mkdir -p /app/data \
    && chown -R node:node /app

COPY --chown=node:node proto ./proto
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts

ENV GRPC_HOST=0.0.0.0 \
    GRPC_PORT=50051 \
    DATA_FILE=/app/data/reservations.json

USER node
EXPOSE 50051

CMD ["node", "src/server.js"]
