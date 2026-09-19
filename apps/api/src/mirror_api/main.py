from contextlib import asynccontextmanager
import asyncio
from collections import defaultdict, deque
import logging
import time
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from . import retrieval, upload_service, workspace_service
from .config import get_settings
from .db import init_db, make_engine, make_session_factory
from .domain import (
    CourseMirrorRequest,
    CourseMirrorResponse,
    HarnessCheck,
    HarnessResult,
    LearningEvidenceDraft,
    StudentProblemReviewRequest,
    StudentUploadRequest,
    StudentUploadResponse,
    TaDecisionRequest,
    TeacherDecisionRequest,
    WorkspaceCreateRequest,
    WorkspaceJoinRequest,
)
from .llm import build_model
from .model_transport import ModelError
from .mirror_service import MirrorError, MirrorPipeline
from .models import CoursePack, Problem, ProblemHint
from .registry import load_course_profiles, public_profile


def configure(app: FastAPI, database_url: str | None = None) -> None:
    """装配运行时依赖。测试可以直接调用并传入 SQLite 地址。"""
    settings = get_settings()
    engine = make_engine(database_url or settings.database_url)
    init_db(engine)
    app.state.session_factory = make_session_factory(engine)
    app.state.pipeline = MirrorPipeline(build_model(settings))
    app.state.engine = engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not hasattr(app.state, "session_factory"):
        configure(app)
    from .sandboxes import cleanup
    from .governance import expire_personal
    def sweep():
        with app.state.session_factory() as db:
            cleanup(db)
            expire_personal(db)
    async def worker():
        while True:
            try:
                await asyncio.to_thread(sweep)
            except Exception:
                logging.getLogger(__name__).exception("Lifecycle sweep failed")
            await asyncio.sleep(max(10, get_settings().cleanup_interval_seconds))
    task=asyncio.create_task(worker())
    try:
        yield
    finally:
        task.cancel()
        try:await task
        except asyncio.CancelledError:pass


app = FastAPI(
    title="Learning Mirror Platform API",
    version="0.2.0",
    description=(
        "Phase 1 base: unified Course Mirror pipeline over course-bound knowledge, "
        "hint ladders, harness checks and learning evidence."
    ),
    lifespan=lifespan,
)

from .platform_api import router
app.include_router(router)
_auth_attempts=defaultdict(deque)


@app.exception_handler(MirrorError)
@app.exception_handler(ModelError)
async def mirror_error_handler(request, exc):
    return JSONResponse(status_code=exc.status_code, content={"detail":exc.detail})


@app.middleware("http")
async def boundary(request: Request, call_next):
    path=request.url.path
    if path.startswith("/api/") and request.method in ("POST","PUT","PATCH","DELETE"):
        if path.startswith("/api/v2/") and request.headers.get("X-Mirror-Request")!="1":
            return JSONResponse(status_code=403,content={"detail":"请求缺少来源校验标记，请刷新页面"})
        # 旧AI页面使用JSON请求；保留兼容，但拒绝可被跨站表单发送的内容类型。
        if path == "/api/v1/course-mirror/requests" and not request.headers.get("content-type", "").startswith("application/json"):
            return JSONResponse(status_code=415,content={"detail":"只接受JSON请求"})
        origin=request.headers.get("origin")
        if origin and origin.rstrip("/") not in {
            str(request.base_url).rstrip("/"), *get_settings().cors_origins
        }:
            # 允许 cloudflared 临时隧道（*.trycloudflare.com）
            if not origin.rstrip("/").endswith(".trycloudflare.com"):
                return JSONResponse(status_code=403,content={"detail":"不允许的请求来源"})
    if path in ("/api/v2/auth/login","/api/v2/auth/register"):
        key=request.client.host if request.client else "unknown"
        now=time.monotonic()
        queue=_auth_attempts[key]
        while queue and now-queue[0]>60:queue.popleft()
        if len(queue)>=20:
            return JSONResponse(status_code=429,content={"detail":"尝试过于频繁，请稍后再试"})
        queue.append(now)
    # 旧教师/上传管理接口缺少归属协议，停止写入，统一使用受控v2。
    if path.startswith(("/api/v1/workspaces","/api/v1/findings","/api/v1/student-uploads")):
        return JSONResponse(status_code=410,content={"detail":"请使用新的Sandbox/私人学习工作台"})
    if path=="/api/v1/course-mirror/requests":
        from .auth import current_account
        try:
            with request.app.state.session_factory() as db:
                current_account(request,db)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code,content={"detail":exc.detail})
    try:
        return await call_next(request)
    except Exception as exc:
        import httpx
        if isinstance(exc,(httpx.HTTPError,TimeoutError)):
            return JSONResponse(status_code=503,content={"detail":"模型暂时不可用，请稍后重试；不会将失败判断写为学习结论"})
        raise

# 允许本机前端（pnpm dev:web 默认 3000 端口）跨域调用；生产环境由 nginx 同域代理，
# 可通过 MIRROR_CORS_ORIGINS 环境变量覆盖。
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db(request: Request) -> Session:
    session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


@app.get("/health")
def health(request: Request) -> dict[str, str]:
    with request.app.state.session_factory() as db:
        db.execute(text("SELECT 1"))
    return {"status": "ok", "phase": "controlled-pilot"}


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
def course_mirror_request(
    request: CourseMirrorRequest, http_request: Request, db: Session = Depends(get_db)
) -> CourseMirrorResponse:
    pipeline: MirrorPipeline = http_request.app.state.pipeline
    from .auth import current_account, require_active
    user=current_account(http_request,db)
    require_active(user)
    # 老AI教学页面复用账号cookie；不允许客户端伪装他人或注入个人模型。
    request.participant_code=user.id
    request.assignment_workspace_id=None
    if request.course_id!="ai_literacy":
        raise HTTPException(410,"数理课程请通过新的学习会话接口")
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


@app.get("/api/v1/problems")
async def list_problems(
    course_id: str, course_profile_id: str, db: Session = Depends(get_db)
) -> list[dict]:
    """学生端选题：只返回运行时授权开放的题目，并附提示阶梯级数。"""
    pack_ids = retrieval.course_pack_ids(db, course_id, course_profile_id)
    if not pack_ids:
        raise HTTPException(status_code=404, detail="未找到该课程的 CoursePack，请先导入课程包")
    problems = (
        db.execute(
            select(Problem)
            .where(Problem.coursepack_id.in_(pack_ids))
            .order_by(Problem.coursepack_id, Problem.problem_id)
        )
        .scalars()
        .all()
    )
    hint_counts = dict(
        db.execute(
            select(ProblemHint.problem_id, func.count(ProblemHint.level))
            .where(ProblemHint.coursepack_id.in_(pack_ids))
            .group_by(ProblemHint.problem_id)
        ).all()
    )
    return [
        {
            "problem_id": problem.problem_id,
            "statement": problem.statement,
            "answer_type": problem.answer_type,
            "max_hint_level": hint_counts.get(problem.problem_id, 0),
        }
        for problem in problems
        if retrieval.runtime_allowed(problem) and problem.provenance!="student_submitted"
    ]


# ---------------------------------------------------------------- 作业工作区（教师/TA 端）
# 隐私红线：以下端点的响应只包含聚合统计与决策留痕，
# 永不返回学生回答内容、请求原文或参与码取值。


@app.post("/api/v1/workspaces")
async def create_workspace(request: WorkspaceCreateRequest, db: Session = Depends(get_db)) -> dict:
    try:
        workspace = workspace_service.create_workspace(db, request)
    except MirrorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return workspace_service.workspace_public(workspace, participants=0)


@app.get("/api/v1/workspaces")
async def list_workspaces(course_id: str | None = None, db: Session = Depends(get_db)) -> list[dict]:
    return workspace_service.list_workspaces(db, course_id)


@app.post("/api/v1/workspaces/join")
async def join_workspace(request: WorkspaceJoinRequest, db: Session = Depends(get_db)) -> dict:
    try:
        workspace = workspace_service.join_workspace(db, request.join_code)
    except MirrorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return workspace_service.workspace_public(
        workspace, workspace_service.participant_count(db, workspace.workspace_id)
    )


@app.post("/api/v1/workspaces/{workspace_id}/close")
async def close_workspace(workspace_id: str, db: Session = Depends(get_db)) -> dict:
    try:
        workspace = workspace_service.close_workspace(db, workspace_id)
    except MirrorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return workspace_service.workspace_public(
        workspace, workspace_service.participant_count(db, workspace.workspace_id)
    )


@app.get("/api/v1/workspaces/{workspace_id}/overview")
async def workspace_overview(workspace_id: str, db: Session = Depends(get_db)) -> dict:
    try:
        return workspace_service.workspace_overview(db, workspace_id)
    except MirrorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@app.post("/api/v1/workspaces/{workspace_id}/insights/generate")
async def generate_insights(workspace_id: str, http_request: Request, db: Session = Depends(get_db)):
    """AI 产出班级现象候选：直接调模型网关，不走学生管线、不落事件。"""
    pipeline: MirrorPipeline = http_request.app.state.pipeline
    try:
        findings = workspace_service.generate_candidate_findings(db, workspace_id, pipeline.model)
    except MirrorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return {"workspace_id": workspace_id, "findings": [workspace_service.finding_public(item) for item in findings]}


@app.get("/api/v1/workspaces/{workspace_id}/findings")
async def list_findings(workspace_id: str, db: Session = Depends(get_db)) -> list[dict]:
    try:
        return workspace_service.list_findings(db, workspace_id)
    except MirrorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@app.post("/api/v1/findings/{finding_id}/ta-decision")
async def ta_decision(finding_id: str, request: TaDecisionRequest, db: Session = Depends(get_db)) -> dict:
    try:
        finding = workspace_service.decide_ta(db, finding_id, request)
    except MirrorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return workspace_service.finding_public(finding)


@app.post("/api/v1/findings/{finding_id}/teacher-decision")
async def teacher_decision(
    finding_id: str, request: TeacherDecisionRequest, db: Session = Depends(get_db)
) -> dict:
    try:
        finding = workspace_service.decide_teacher(db, finding_id, request)
    except MirrorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return workspace_service.finding_public(finding)


@app.get("/api/v1/workspaces/{workspace_id}/report")
async def workspace_report(workspace_id: str, db: Session = Depends(get_db)) -> dict:
    """周报：仅含教师接受的现象 + 覆盖声明 + 过程证据通道声明。"""
    try:
        return workspace_service.build_report(db, workspace_id)
    except MirrorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


# ---------------------------------------------------------------- 学生错题上传


@app.post("/api/v1/student-uploads", response_model=StudentUploadResponse)
async def upload_student_problem(
    request: StudentUploadRequest,
    http_request: Request,
    db: Session = Depends(get_db),
) -> StudentUploadResponse:
    """学生上传错题：识别/入库、生成提示阶梯、返回首级提示与相似题。"""
    pipeline: MirrorPipeline = http_request.app.state.pipeline
    try:
        return upload_service.handle_upload(db, request, pipeline.model, pipeline)
    except MirrorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    except upload_service.UploadError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@app.get("/api/v1/student-uploads/pending")
async def list_pending_uploads(
    course_id: str | None = None,
    db: Session = Depends(get_db),
) -> list[dict]:
    """列出学生上传题（供教师/TA 审校）。"""
    problems = upload_service.list_pending_uploads(db, course_id=course_id)
    return [
        {
            "coursepack_id": problem.coursepack_id,
            "problem_id": problem.problem_id,
            "statement": problem.statement,
            "answer_type": problem.answer_type,
            "review": problem.review,
            "rights": problem.rights,
        }
        for problem in problems
    ]


@app.post("/api/v1/student-uploads/{coursepack_id}/{problem_id}/review")
async def review_student_problem(
    coursepack_id: str,
    problem_id: str,
    request: StudentProblemReviewRequest,
    db: Session = Depends(get_db),
) -> dict:
    """教师/TA 对学生上传题进行审校。"""
    try:
        if request.decision == "approved":
            problem = upload_service.approve_student_problem(
                db, coursepack_id, problem_id, request.note
            )
        else:
            problem = upload_service.reject_student_problem(
                db, coursepack_id, problem_id, request.note
            )
    except MirrorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    except upload_service.UploadError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return {
        "coursepack_id": problem.coursepack_id,
        "problem_id": problem.problem_id,
        "review": problem.review,
        "rights": problem.rights,
    }
