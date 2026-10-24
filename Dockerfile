FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy application files
COPY src/ ./src/
COPY public/ ./public/
COPY .env.example ./.env.example

# Create persistent data and uploads directory
RUN mkdir -p /app/data /app/uploads

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["npm", "start"]
