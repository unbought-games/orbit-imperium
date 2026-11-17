# Separate internal renderer image. No application/database or infrastructure deployment.
FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY packages/ship-appearance ./packages/ship-appearance
COPY apps/web/src ./apps/web/src
COPY tools/ship-appearance ./tools/ship-appearance
RUN node tools/ship-appearance/build.mjs

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
# package-lock pins Playwright 1.56.1 and its exact Chromium revision.
RUN node node_modules/playwright/cli.js install --with-deps chromium && chmod -R a+rX /root/.cache/ms-playwright && mkdir -p /opt/playwright && cp -a /root/.cache/ms-playwright/. /opt/playwright/
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
COPY package.json ./
COPY packages/ship-appearance ./packages/ship-appearance
COPY tools/ship-appearance/*.mjs ./tools/ship-appearance/
COPY --from=build /app/tools/ship-appearance/dist ./tools/ship-appearance/dist
COPY apps/web/public/art/ship-skins ./apps/web/public/art/ship-skins
COPY crates/application/assets/insignias ./crates/application/assets/insignias
USER node
ENV ORBIT_SHIP_RENDERER_HOST=0.0.0.0 ORBIT_SHIP_RENDERER_PORT=52941
EXPOSE 52941
CMD ["node", "tools/ship-appearance/server.mjs"]
