FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY proto ./proto
COPY src ./src
EXPOSE 50051
CMD ["npm", "start"]
