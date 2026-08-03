FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV DOCKER=true
ENV PORT=9999

COPY package*.json ./

RUN npm ci --only=production || npm install --omit=dev

COPY . .

RUN mkdir -p uploads

EXPOSE 9999

CMD ["node", "server.js"]
