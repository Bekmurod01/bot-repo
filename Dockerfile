# Node.js 20 Alpine (eng yengil va ishonchli)
FROM node:20-alpine

# Ish papkasi
WORKDIR /app

# libatomic1 va pg uchun kerakli paketlar
RUN apk add --no-cache libatomic1 postgresql-dev gcc g++ make

# package.json va package-lock.json nusxalash
COPY package*.json ./

# Dependencies install (production only)
RUN npm ci --omit=dev

# Barcha kodlarni nusxalash
COPY . .

# Port (Railway avto tanlaydi)
EXPOSE 3000

# Start command
CMD ["node", "main.js"]
