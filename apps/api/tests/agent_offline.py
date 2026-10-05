"""Run pytest with external sockets disabled; permit loopback for local event loops.

Usage from this worktree: .venv/Scripts/python.exe apps/api/tests/agent_offline.py -q
No shared conftest changes; protection applies only to this runner's process.
"""
import os
import socket
import sys
from pathlib import Path

import pytest


def main():
    os.environ["MIRROR_LLM_PROVIDER"] = "stub"
    os.environ["MIRROR_DATABASE_URL"] = "sqlite://"
    os.environ["MIRROR_LLM_API_KEY"] = "offline-fixture-not-a-key"
    os.environ["MIRROR_LLM_BASE_URL"] = "https://example.invalid"
    os.environ["MIRROR_LLM_MODEL"] = "offline-fixture"
    connect = socket.socket.connect
    connect_ex = socket.socket.connect_ex
    getaddrinfo = socket.getaddrinfo

    def check_host(host):
        if host not in ("localhost", "127.0.0.1", "::1", b"localhost", b"127.0.0.1", b"::1"):
            raise RuntimeError("External network disabled by agent offline test runner")

    def guarded_connect(sock, address):
        check_host(address[0])
        return connect(sock, address)

    def guarded_connect_ex(sock, address):
        check_host(address[0])
        return connect_ex(sock, address)

    def guarded_getaddrinfo(host, *args, **kwargs):
        check_host(host)
        return getaddrinfo(host, *args, **kwargs)

    socket.socket.connect = guarded_connect
    socket.socket.connect_ex = guarded_connect_ex
    socket.getaddrinfo = guarded_getaddrinfo
    try:
        return pytest.main([str(Path(__file__).parent), *sys.argv[1:]])
    finally:
        socket.socket.connect = connect
        socket.socket.connect_ex = connect_ex
        socket.getaddrinfo = getaddrinfo


if __name__ == "__main__":
    raise SystemExit(main())
