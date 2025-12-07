# Node.js 20 with PM2 for Polymarket BTC Prediction Bot
FROM node:20-slim

# Install PM2 globally
RUN npm install -g pm2

# Install dependencies for onnxruntime-node
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* bun.lockb* ./

# Install dependencies
RUN npm install --production=false

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Copy model files (mounted at runtime, but create dir)
RUN mkdir -p /app/model

# Build TypeScript
RUN npm run build

# Create PM2 ecosystem file
RUN echo '{\
  "apps": [{\
    "name": "btc-bot",\
    "script": "dist/index.js",\
    "instances": 1,\
    "autorestart": true,\
    "watch": false,\
    "max_memory_restart": "500M",\
    "env": {\
      "NODE_ENV": "production"\
    },\
    "error_file": "/app/logs/error.log",\
    "out_file": "/app/logs/out.log",\
    "log_date_format": "YYYY-MM-DD HH:mm:ss Z",\
    "merge_logs": true\
  }]\
}' > ecosystem.config.json

# Create logs directory
RUN mkdir -p /app/logs

# Expose for health checks (optional)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Run with PM2
CMD ["pm2-runtime", "start", "ecosystem.config.json"]

