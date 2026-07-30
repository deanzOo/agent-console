# The agent runs real commands, so the container is also the sandbox boundary.
# Everything the agent needs — git, the Claude CLI — lives inside the image.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 has no prebuilt binary for this image and compiles from source,
# so the toolchain is needed here. It stays in this stage — the runtime image
# copies only node_modules and never sees a compiler.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

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

ARG GH_VERSION=2.96.0
ARG TARGETARCH

# git is the product; gh opens the pull requests; openssh for key-based pushes.
# The user is created here, before any COPY, so ownership is set at copy time.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git ca-certificates openssh-client tini curl \
 && curl -fsSL -o /tmp/gh.deb \
      "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${TARGETARCH:-amd64}.deb" \
 && dpkg -i /tmp/gh.deb \
 && rm -f /tmp/gh.deb \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @anthropic-ai/claude-code \
 && npm cache clean --force \
 && useradd --system --create-home --uid 10001 agent \
 && mkdir -p /data /workspace \
 && chown agent:agent /app /data /workspace

# --chown sets ownership as files are written. A `chown -R` afterwards would
# copy every file up into a new overlay layer — on node_modules that is tens of
# thousands of files, which doubles the image and stalls the build on I/O.
COPY --from=deps --chown=agent:agent /app/node_modules ./node_modules
COPY --from=build --chown=agent:agent /app/.next ./.next
# Each directory needs its own COPY: with several sources, COPY flattens
# directory *contents* into the destination, so `drizzle` would land as loose
# files in /app and the migrations would not be found.
COPY --chown=agent:agent package.json next.config.ts ./
COPY --chown=agent:agent drizzle ./drizzle
COPY --chown=agent:agent public ./public

# Never root: the agent can do anything this user can.
USER agent

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
