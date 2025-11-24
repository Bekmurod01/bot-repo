# Debian slim — libatomic1 bor, pg muammosiz ishlaydi
FROM node:20-slim

# Kerakli system paketlari (libatomic1 + pg uchun)
RUN apt-get update && apt-get install -y \
    libatomic1 \
    libpq-dev \
    gcc \
    g++ \
    make \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Ish papkasi
WORKDIR /app

# package.json va lock faylni nusxalash
COPY package*.json ./

# Dependencies (faqat production)
RUN npm ci --omit=dev

# Barcha kodlarni nusxalash
COPY . .

# Start
CMD ["node", "main.js"]
