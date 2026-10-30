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

# Create directory structure and enterprise policy directories
RUN mkdir -p /var/log /root/.config/openbox /etc/chromium/policies/managed /etc/chromium-browser/policies/managed /etc/opt/chrome/policies/managed

# Enterprise lockdown policies to prevent Sync, Profile Picker, and settings bubbles
COPY policies.json /etc/chromium/policies/managed/policies.json
COPY policies.json /etc/chromium-browser/policies/managed/policies.json
COPY policies.json /etc/opt/chrome/policies/managed/policies.json

# Configure noVNC to automatically connect and auto-scale display on root access
RUN echo '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=vnc.html?autoconnect=true&resize=scale&reconnect=true"></head><body>Redirecting to Kiosk Session...</body></html>' > /usr/share/novnc/index.html

# Copy supervisor config, launcher script, and control agent
COPY supervisord.conf /etc/supervisord.conf
COPY start-kiosk.sh /start-kiosk.sh
COPY kiosk-agent.py /kiosk-agent.py
RUN chmod +x /start-kiosk.sh

EXPOSE 8080

HEALTHCHECK --interval=5s --timeout=5s --start-period=5s --retries=5 \
  CMD curl -f http://localhost:8080/ || exit 1

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
