FROM alpine:3.19

# Install X11, VNC, noVNC, Openbox window manager, Chromium, fonts, and supervisor
RUN apk update && apk add --no-cache \
    bash \
    curl \
    xvfb \
    x11vnc \
    openbox \
    novnc \
    websockify \
    chromium \
    supervisor \
    ttf-dejavu \
    font-noto \
    && rm -rf /var/cache/apk/*

# Create directory structure
RUN mkdir -p /var/log /root/.config/openbox

# Configure noVNC to automatically connect and auto-scale display on root access
RUN echo '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=vnc.html?autoconnect=true&resize=scale&reconnect=true"></head><body>Redirecting to Kiosk Session...</body></html>' > /usr/share/novnc/index.html

# Copy supervisor config and launcher script
COPY supervisord.conf /etc/supervisord.conf
COPY start-kiosk.sh /start-kiosk.sh
RUN chmod +x /start-kiosk.sh

EXPOSE 8080

HEALTHCHECK --interval=5s --timeout=5s --start-period=5s --retries=5 \
  CMD curl -f http://localhost:8080/ || exit 1

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
