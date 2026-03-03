# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install --no-audit

# Copy source
COPY src ./src
COPY tsconfig.json ./

# Build TypeScript - use npx to ensure typescript is found
RUN npx --yes tsc

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Copy package files from builder
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm ci --production --no-audit || npm install --production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy migration files (needed at runtime by node-pg-migrate)
COPY migrations ./migrations

# Expose port
EXPOSE 3000

# Run
CMD ["node", "dist/index.js"]
