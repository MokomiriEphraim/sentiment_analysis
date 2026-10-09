# ── Stage 1: Build the Vite React frontend ─────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Production runtime (Node + Python) ─────────────────────────────────
FROM node:22-slim
WORKDIR /app

# Install Python and pip
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv curl && \
    rm -rf /var/lib/apt/lists/*

# Install Node production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Install Python dependencies (into system Python — no venv needed in Docker)
COPY python/requirements.txt python/requirements.txt
RUN pip3 install --break-system-packages -r python/requirements.txt

# Copy built frontend and server source
COPY --from=builder /app/dist ./dist
COPY server.ts ./
COPY python/ ./python/
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY src/ ./src/

# Copy startup script
COPY start.sh ./
RUN chmod +x start.sh

# Expose the port Render will use
EXPOSE 3000

ENV NODE_ENV=production
ENV PYTHON_URL=http://127.0.0.1:8000

CMD ["./start.sh"]
