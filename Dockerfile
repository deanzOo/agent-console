# The agent runs real commands, so the container is also the sandbox boundary.
# Everything the agent needs — git, the Claude CLI — lives inside the image.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts=false

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Boot-time config is absent during build; these satisfy the parser only.
RUN AUTH_MODE=trusted-network npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    WORKSPACE_ROOT=/workspace

# git is the product; ca-certificates and openssh for cloning and pushing.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates openssh-client tini \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @anthropic-ai/claude-code \
 && npm cache clean --force

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY package.json next.config.ts drizzle ./
COPY public ./public

# Never root: the agent can do anything this user can.
RUN useradd --system --create-home --uid 10001 agent \
 && mkdir -p /data /workspace \
 && chown -R agent:agent /app /data /workspace
USER agent

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
