FROM node:20-alpine

# Set working directory inside container
WORKDIR /usr/src/app

# Set environment variables to optimize production run and skip heavy chromium downloads
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV DOCKER=true
ENV PORT=9999

# Copy package management files first for optimized Docker caching
COPY package*.json ./

# Install project dependencies cleanly without development tools or browser binaries
RUN npm ci --only=production || npm install --omit=dev

# Copy application source code
COPY . .

# Ensure upload directory exists and set correct permissions
RUN mkdir -p uploads

# Expose server port
EXPOSE 9999

# Start EdgeShare server
CMD ["node", "server.js"]
