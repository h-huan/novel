# ═══════════════════════════════════════════
#  NestJS Server — 多阶段 Dockerfile
# ═══════════════════════════════════════════

# ──────────────────────────────────────────
#  Stage 0: Base —— 公共基础层
# ──────────────────────────────────────────
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# 复制 monorepo 根配置文件
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json turbo.json ./

# 复制 server 的 package.json
COPY server/package.json server/

# ──────────────────────────────────────────
#  Stage 1: Development —— 本地开发热重载
# ──────────────────────────────────────────
FROM base AS development

RUN pnpm install --filter=@novel-ai/server --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["pnpm", "dev:server"]

# ──────────────────────────────────────────
#  Stage 2: Builder —— 生产构建
# ──────────────────────────────────────────
FROM base AS builder

RUN pnpm install --filter=@novel-ai/server --frozen-lockfile

COPY . .

RUN pnpm build:server

# ──────────────────────────────────────────
#  Stage 3: Production —— 最小生产镜像
# ──────────────────────────────────────────
FROM node:20-alpine AS production
ENV NODE_ENV=production

RUN apk add --no-cache curl tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

# 创建非 root 用户
RUN addgroup -g 1001 novelai && \
    adduser -D -u 1001 -G novelai novelai

WORKDIR /app

# 从 builder 复制产物
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

# 仅安装生产依赖
RUN corepack enable && corepack prepare pnpm@9 --activate && \
    pnpm install --filter=@novel-ai/server --frozen-lockfile --prod

RUN chown -R novelai:novelai /app

USER novelai

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
