# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# Stage 2: Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

# Install native packages required for Tesseract OCR / Canvas if needed
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-eng

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 5000

USER node

CMD ["node", "dist/server.js"]
