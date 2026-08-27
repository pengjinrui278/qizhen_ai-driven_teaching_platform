from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException

from .domain import (
    CourseMirrorRequest,
    CourseMirrorResponse,
    HarnessCheck,
    HarnessResult,
    LearningEvidenceDraft,
)
from .registry import load_course_profiles, public_profile

app = FastAPI(
    title="Learning Mirror Platform API",
    version="0.1.0",
    description="Phase 0 contracts for Student Mirror, Course Mirror and Assignment Workspace.",
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "phase": "0"}


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

    # Phase 0 uses a deterministic adapter. A real model cannot bypass this contract.
    return CourseMirrorResponse(
        request_id=request.request_id,
        course_id=request.course_id,
        answer=f"[{profile.mirror_name} 协议预览] 已接收问题；阶段 1 将接入检索、提示规划与课程 Harness。",
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

