from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import init_db, make_engine, make_session_factory
from .domain import (
    CourseMirrorRequest,
    CourseMirrorResponse,
    HarnessCheck,
    HarnessResult,
    LearningEvidenceDraft,
)
from .llm import build_model
from .mirror_service import MirrorError, MirrorPipeline
from .models import CoursePack
from .registry import load_course_profiles, public_profile


def configure(app: FastAPI, database_url: str | None = None) -> None:
    """装配运行时依赖。测试可以直接调用并传入 SQLite 地址。"""
    settings = get_settings()
    engine = make_engine(database_url or settings.database_url)
    init_db(engine)
    app.state.session_factory = make_session_factory(engine)
    app.state.pipeline = MirrorPipeline(build_model(settings))


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not hasattr(app.state, "session_factory"):
        configure(app)
    yield


app = FastAPI(
    title="Learning Mirror Platform API",
    version="0.2.0",
    description=(
        "Phase 1 base: unified Course Mirror pipeline over course-bound knowledge, "
        "hint ladders, harness checks and learning evidence."
    ),
    lifespan=lifespan,
)


def get_db(request: Request) -> Session:
    session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "phase": "1-base"}


@app.get("/api/v1/courses")
async def courses() -> list[dict]:
    return [public_profile(item) for item in load_course_profiles().values()]


@app.get("/api/v1/courses/{course_id}")
async def course(course_id: str) -> dict:
    profile = load_course_profiles().get(course_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Course Mirror not found")
    return public_profile(profile)


@app.post("/api/v1/course-mirror/preview", response_model=CourseMirrorResponse)
async def preview_course_mirror(request: CourseMirrorRequest) -> CourseMirrorResponse:
    profile = load_course_profiles().get(request.course_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Course Mirror not found")

    # 阶段 0 的确定性协议预览，保留用于前端联调；真实请求走 /requests。
    return CourseMirrorResponse(
        request_id=request.request_id,
        course_id=request.course_id,
        answer=f"[{profile.mirror_name} 协议预览] 已接收问题；真实处理请调用 /api/v1/course-mirror/requests。",
        answer_type="contract_preview",
        hint_level=1 if request.interaction_mode.value.endswith("hint") else None,
        harness=HarnessResult(
            status="not_run",
            checks=[
                HarnessCheck(
                    name=name,
                    status="not_run",
                    detail="阶段 0 仅登记 Harness，不执行专业判断。",
                )
                for name in profile.harnesses
            ],
            warnings=["当前响应不能作为课程问题答案。"],
        ),
        evidence=[
            LearningEvidenceDraft(
                event_type="help_request_received",
                observation="本次会话收到一次课程帮助请求；尚不能据此形成长期能力判断。",
                reasoning_stage=None,
                strength="weak",
                source_event_ids=[request.request_id],
                occurred_at=datetime.now(UTC),
            )
        ],
        uncertainty=["尚未接入课程知识与模型。"],
    )


@app.post("/api/v1/course-mirror/requests", response_model=CourseMirrorResponse)
async def course_mirror_request(
    request: CourseMirrorRequest, http_request: Request, db: Session = Depends(get_db)
) -> CourseMirrorResponse:
    pipeline: MirrorPipeline = http_request.app.state.pipeline
    try:
        return pipeline.handle(db, request)
    except MirrorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@app.get("/api/v1/coursepacks")
async def list_coursepacks(db: Session = Depends(get_db)) -> list[dict]:
    packs = db.execute(select(CoursePack).order_by(CoursePack.imported_at)).scalars().all()
    return [
        {
            "coursepack_id": pack.coursepack_id,
            "course_id": pack.course_id,
            "profile_id": pack.profile_id,
            "status": pack.status,
            "textbook": pack.textbook,
            "content_policy": pack.content_policy,
            "imported_at": pack.imported_at.isoformat() if pack.imported_at else None,
        }
        for pack in packs
    ]
