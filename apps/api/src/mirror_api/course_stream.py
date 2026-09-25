"""SSE progress with an audited final result; never stream unchecked model text."""
from concurrent.futures import ThreadPoolExecutor
from queue import Queue, Empty
from threading import BoundedSemaphore
import json

from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from .mirror_service import MirrorError
from .model_transport import ModelError

_workers = ThreadPoolExecutor(max_workers=4, thread_name_prefix="course-response")
_slots = BoundedSemaphore(4)


def response_stream(work):
    if not _slots.acquire(blocking=False):
        raise HTTPException(429, "课程助手正在处理其他请求，请稍后重试。")
    events = Queue(maxsize=16)

    def run():
        try:
            result = work(lambda stage: events.put(("progress", {"stage": stage})))
            events.put(("done", result))
        except (HTTPException, MirrorError, ModelError) as exc:
            events.put(("error", {"detail": str(exc.detail), "status": exc.status_code}))
        except Exception:
            events.put(("error", {"detail": "本次回答未完成，请重试；已保存的对话不会丢失。", "status": 503}))
        finally:
            _slots.release()

    try:
        _workers.submit(run)
    except Exception:
        _slots.release()
        raise HTTPException(503, "课程助手暂不可用，请稍后重试。") from None

    def generate():
        yield 'event: progress\ndata: {"stage":"queued"}\n\n'
        while True:
            try:
                kind, data = events.get(timeout=10)
            except Empty:
                yield ': keepalive\n\n'
                continue
            yield f"event: {kind}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
            if kind in ("done", "error"):
                return

    # A disconnected client does not trigger a second model call. The bounded
    # worker completes and persists the result, replayable by request_id.
    return StreamingResponse(generate(), media_type="text/event-stream", headers={
        "Cache-Control": "no-store", "X-Accel-Buffering": "no",
    })
