# ==========================================
# Stage 1: Build the React Application
# ==========================================
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies (use npm ci if package-lock is present, else npm install)
RUN npm install --legacy-peer-deps

# Copy application source code
COPY . .

# Set production environment and build React bundle
ENV NODE_ENV=production
RUN npm run build

# ==========================================
# Stage 2: Serve with Nginx
# ==========================================
FROM nginx:1.25-alpine

# Remove default nginx html files
RUN rm -rf /usr/share/nginx/html/*

# Copy build output from Stage 1
COPY --from=builder /app/build /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
