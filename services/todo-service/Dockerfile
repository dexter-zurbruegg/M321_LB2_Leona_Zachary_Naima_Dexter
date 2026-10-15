FROM node:22-alpine
# tini als PID 1: leitet Signale korrekt weiter. Stürzt node ab, endet der Container -> Docker/Kubernetes startet ihn neu.
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
# nicht als root laufen
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
