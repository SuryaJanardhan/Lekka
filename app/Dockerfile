# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json tsconfig.json vite.config.ts index.html ./
RUN npm ci

COPY src ./src
RUN --mount=type=secret,id=app_env,target=/usr/src/app/.env.production,required=true \
    node --input-type=module -e "import { loadEnv } from 'vite'; const env = loadEnv('production', process.cwd()); if (!env.VITE_BACKEND_URL?.startsWith('https://') || !env.VITE_LEKKA_API_SECRET) throw new Error('Production HTTPS backend and API secret are required');" \
    && npm run build

# Stage 2: Serve stage via Nginx
FROM nginx:alpine

COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
