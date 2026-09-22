# Build stage: pinned Node toolchain, reproducible install, static bundle.
FROM node:22-alpine AS build

WORKDIR /app

# Lockfile first, so the dependency layer survives source changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage: nginx serves the bundle and reverse-proxies /api to the backend.
FROM nginx:1.29-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
