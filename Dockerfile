FROM node:24-alpine

# ffmpeg transcodes audio for voice playback
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# data: SQLite database and audio files, logs: daily activity logs
RUN mkdir -p data logs && chown -R node:node data logs

ENV NODE_ENV=production
USER node

CMD ["node", "src/index.js"]
