# Vargov®Design — proposal generator (web app), browser-free cloud build.
# Tilda serves the product JSON in server-rendered HTML, so a plain HTTPS
# request is enough — no Chromium needed, keeping the image small and cheap.
FROM node:20-slim

ENV NODE_ENV=production \
    NO_BROWSER=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# Install production dependencies first (better layer caching).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source (assets, templates, bundled data, src).
COPY . .

# Hosts inject PORT; the server also listens on 0.0.0.0 by default.
EXPOSE 8815
CMD ["npm", "start"]
