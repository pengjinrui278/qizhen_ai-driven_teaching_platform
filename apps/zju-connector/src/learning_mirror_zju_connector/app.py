from __future__ import annotations

import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from .client import ZjuClient, ZjuConnectorError

LOCAL_HOSTS = {"127.0.0.1:8765", "localhost:8765", "[::1]:8765"}
LOCAL_ORIGINS = {"http://127.0.0.1:8765", "http://localhost:8765"}


class ConnectRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class SyncRequest(BaseModel):
    academic_year_start: int = Field(ge=2000, le=2200)
    season: str


class ConnectorState:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.client = ZjuClient()
        self.last_sync: dict[str, Any] | None = None

    def reset(self) -> None:
        self.client.logout()
        self.last_sync = None


state = ConnectorState()
app = FastAPI(
    title="Learning Mirror ZJU Local Connector",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.middleware("http")
async def local_only(request: Request, call_next):
    host = request.headers.get("host", "")
    origin = request.headers.get("origin")
    if host not in LOCAL_HOSTS or (origin is not None and origin not in LOCAL_ORIGINS):
        return HTMLResponse("Local access only", status_code=403)
    return await call_next(request)


def _require_local_header(value: str | None) -> None:
    if value != "1":
        raise HTTPException(status_code=403, detail="缺少本地连接器请求标记。")


def _mask_username(username: str | None) -> str | None:
    if not username:
        return None
    if len(username) <= 4:
        return "*" * len(username)
    return username[:2] + "*" * (len(username) - 4) + username[-2:]


def _error(exc: ZjuConnectorError) -> HTTPException:
    return HTTPException(status_code=400, detail={"code": exc.code, "message": str(exc)})


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return (Path(__file__).with_name("index.html")).read_text(encoding="utf-8")


@app.get("/api/status")
def status() -> dict[str, Any]:
    with state.lock:
        return {
            "connected": state.client.connected,
            "account": _mask_username(state.client.username),
            "has_snapshot": state.last_sync is not None,
        }


@app.post("/api/connect")
def connect(
    payload: ConnectRequest,
    x_learning_mirror_local: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_local_header(x_learning_mirror_local)
    try:
        with state.lock:
            state.reset()
            state.client.login(payload.username, payload.password)
            state.client.connect_academic()
            state.client.connect_learning()
            return {"connected": True, "account": _mask_username(state.client.username)}
    except ZjuConnectorError as exc:
        with state.lock:
            state.reset()
        raise _error(exc) from exc


@app.post("/api/sync")
def sync(
    payload: SyncRequest,
    x_learning_mirror_local: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_local_header(x_learning_mirror_local)
    try:
        with state.lock:
            result = state.client.sync(payload.academic_year_start, payload.season).to_dict()
            result["fetched_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
            state.last_sync = result
            return result
    except ZjuConnectorError as exc:
        raise _error(exc) from exc


@app.post("/api/logout")
def logout(x_learning_mirror_local: str | None = Header(default=None)) -> dict[str, bool]:
    _require_local_header(x_learning_mirror_local)
    with state.lock:
        state.reset()
    return {"connected": False}

