# SAQIB MD Premium WhatsApp Bot
FROM node:20-slim

# ffmpeg  -> stickers / audio effects / media conversion / yt-dlp merge
# yt-dlp  -> downloads (YouTube, Instagram, Facebook, Twitter/X, TikTok, Pinterest…)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates curl \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "index.js"]
