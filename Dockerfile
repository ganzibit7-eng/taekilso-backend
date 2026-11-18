FROM node:26-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node api ./api
COPY --chown=node:node lib ./lib
COPY --chown=node:node server.cjs ./server.cjs
COPY --chown=node:node runtime-auth.cjs ./runtime-auth.cjs
USER node
EXPOSE 8080
CMD ["node", "server.cjs"]
