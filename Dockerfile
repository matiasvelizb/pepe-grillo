# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Production stage
FROM node:20-alpine

# Install ffmpeg and runtime dependencies
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create temp directory for audio files with correct permissions
RUN mkdir -p temp && chown -R node:node temp

# Set environment to production
ENV NODE_ENV=production

# Run as non-root user
USER node

# Start the bot
CMD ["node", "src/index.js"]
