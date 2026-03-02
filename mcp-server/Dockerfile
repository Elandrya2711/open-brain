FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* yarn.lock* ./

RUN npm install || yarn install

# Copy source
COPY src src
COPY tsconfig.json .

# Build
RUN npm run build

# Expose port for HTTP MCP endpoint
EXPOSE 3000

# Run with stdin/stdout open for MCP stdio transport
CMD ["npm", "start"]
