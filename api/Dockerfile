FROM node:22-alpine
WORKDIR /app
COPY server.js .
# /data is a named volume (see deploy/compose.yml); it inherits this owner on first use
RUN mkdir -p /data && chown node:node /data
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
