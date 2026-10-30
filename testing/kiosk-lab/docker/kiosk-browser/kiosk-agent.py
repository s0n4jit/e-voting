import os
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

class KioskAgentHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path in ('/action/restart_browser', '/action/restart-browser'):
            # Terminate Chromium; supervisor autorestart will instantly respawn it
            subprocess.run(['pkill', '-f', 'chromium'], check=False)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": "success", "action": "restart_browser"}')

        elif self.path in ('/action/restart_kiosk', '/action/restart-kiosk'):
            # Restart Openbox window manager and Chromium
            subprocess.run(['pkill', '-f', 'chromium'], check=False)
            subprocess.run(['pkill', '-f', 'openbox'], check=False)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": "success", "action": "restart_kiosk"}')

        elif self.path in ('/action/restart_system', '/action/restart-system'):
            # Full graphical reboot simulation: restart Openbox, VNC and Chromium
            subprocess.run(['pkill', '-f', 'chromium'], check=False)
            subprocess.run(['pkill', '-f', 'openbox'], check=False)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": "success", "action": "restart_system"}')

        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": "ready"}')
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Suppress noisy healthcheck logs
        pass

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', 8085), KioskAgentHandler)
    server.serve_forever()
