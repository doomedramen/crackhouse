# See here for image contents: https://github.com/devcontainers/images/tree/main/src/typescript-node
FROM mcr.microsoft.com/devcontainers/typescript-node:22

# Install additional OS packages
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends \
    postgresql-client \
    redis-tools \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set the working directory
WORKDIR /workspaces/crackhouse

# Copy package files for caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile
