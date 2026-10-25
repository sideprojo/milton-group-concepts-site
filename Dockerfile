FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY . /app
RUN mkdir -p /app/.data && chown -R node:node /app
USER node
EXPOSE 8080
CMD ["node", "server.js"]
