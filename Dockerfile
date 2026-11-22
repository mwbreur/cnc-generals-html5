# Pin patch-level Node.js 24 LTS release containing the CVE-2026-111497 (Brotli) fix
FROM node:24.22.1-alpine

WORKDIR /app

# Copy only the source files needed to build and serve the game (zero npm install required)
COPY package.json build.js ./
COPY src ./src
COPY tools/lint_js.js ./tools/lint_js.js
COPY scripts/lan_server.mjs ./scripts/lan_server.mjs

# Pre-build index.html and assets/data/ into the image for instant startup
RUN node build.js && chown -R node:node /app

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/lan-status || exit 1

CMD ["node", "scripts/lan_server.mjs", "--no-build", "--port=8080"]
