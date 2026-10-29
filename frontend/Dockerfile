# ==========================================
# Stage 1: Build the React Application with Vite
# ==========================================
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies fast and cleanly
RUN npm install

# Copy application source code
COPY . .

# Build production distribution bundle
RUN npm run build

# ==========================================
# Stage 2: Serve with Nginx
# ==========================================
FROM nginx:1.25-alpine

# Remove default nginx html files
RUN rm -rf /usr/share/nginx/html/*

# Copy build output from Stage 1 (Vite outputs to dist/)
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
