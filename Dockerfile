FROM node:23-alpine

# Install dependencies untuk WhatsApp Web.js
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    yarn

# Set working directory
WORKDIR /app

# Environment variables untuk Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy package.json dan yarn.lock
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy seluruh kode aplikasi
COPY . .

# Expose port yang diperlukan (sesuaikan port jika perlu)
EXPOSE 3000

# Command untuk menjalankan aplikasi
CMD ["yarn", "start"]