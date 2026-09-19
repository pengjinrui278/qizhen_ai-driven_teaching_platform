from __future__ import annotations

import argparse
import threading
import webbrowser

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Learning Mirror ZJU local connector")
    parser.add_argument("--no-browser", action="store_true", help="do not open the local UI")
    args = parser.parse_args()
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open("http://127.0.0.1:8765")).start()
    uvicorn.run(
        "learning_mirror_zju_connector.app:app",
        host="127.0.0.1",
        port=8765,
        access_log=False,
        log_level="warning",
    )


if __name__ == "__main__":
    main()

