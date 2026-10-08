# OmniRoute's published image in one layer. Upstream's `chown -R node:node /app` layer repeats
# all 2.04 GB of /app, and onnxruntime-node ships Windows, macOS and x64 builds that never load
# on this arm64 host. Built by `docker compose build omniroute` on the instance.
ARG UPSTREAM=diegosouzapw/omniroute:3.8.50
FROM ${UPSTREAM} AS upstream
USER root
RUN rm -rf /app/node_modules/onnxruntime-node/bin/napi-v6/win32 \
           /app/node_modules/onnxruntime-node/bin/napi-v6/darwin \
           /app/node_modules/onnxruntime-node/bin/napi-v6/linux/x64 \
 && find /app -name '*.map' -type f -delete

FROM scratch
COPY --from=upstream / /
# The upstream image's configuration, which a FROM scratch stage does not inherit.
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    NODE_VERSION=26.7.0 \
    NODE_ENV=production \
    PORT=20128 \
    HOSTNAME=0.0.0.0 \
    OMNIROUTE_MEMORY_MB=1024 \
    NODE_OPTIONS=--max-old-space-size=1024 \
    DATA_DIR=/app/data \
    OMNIROUTE_MIGRATIONS_DIR=/app/migrations
WORKDIR /app
USER node
EXPOSE 20128
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "healthcheck.mjs"]
ENTRYPOINT ["/app/check-permissions.sh"]
CMD ["node", "dev/run-standalone.mjs"]
