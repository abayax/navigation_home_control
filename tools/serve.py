#!/usr/bin/env python3
"""Serve Home Explorer on the local network with caching disabled, so browsers
always load the latest code and layouts. Opens the game in your browser.

    python3 tools/serve.py                    # port 5173, opens the browser
    python3 tools/serve.py --port 8080        # another port
    python3 tools/serve.py --layout office    # open straight into a layout
    python3 tools/serve.py --no-browser       # just serve
"""
import argparse
import socket
import sys
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


def lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))  # no packets sent; just picks the LAN interface
            return s.getsockname()[0]
    except OSError:
        return "<mac-ip>"


def main():
    parser = argparse.ArgumentParser(description="Serve Home Explorer")
    parser.add_argument("port_arg", nargs="?", type=int, help=argparse.SUPPRESS)  # old style: serve.py 8080
    parser.add_argument("--port", type=int, default=5173)
    parser.add_argument("--layout", help="layout id to open, e.g. home or office")
    parser.add_argument("--no-browser", action="store_true", help="don't open a browser")
    args = parser.parse_args()
    port = args.port_arg or args.port

    handler = partial(NoCacheHandler, directory=str(ROOT))
    try:
        httpd = ThreadingHTTPServer(("0.0.0.0", port), handler)
    except OSError as e:
        sys.exit(f"Can't start on port {port} ({e.strerror}). Is the server already running? "
                 f"Stop it with Ctrl+C, or use --port to pick another port.")

    query = f"?layout={quote(args.layout)}" if args.layout else ""
    local_url = f"http://localhost:{port}/{query}"
    with httpd:
        print(f"Serving {ROOT}")
        print(f"  Mac:          {local_url}")
        print(f"  iPad/iPhone:  http://{lan_ip()}:{port}/{query}")
        print("Press Ctrl+C to stop.")
        if not args.no_browser:
            # Give the server a moment to start listening before the browser connects
            threading.Timer(0.5, webbrowser.open, args=(local_url,)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
