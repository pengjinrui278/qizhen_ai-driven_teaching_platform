"""受身份与归属约束的内测API，前端统一入口使用此协议。"""
import hashlib
import json
import secrets
import uuid
from threading import RLock
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from . import memory, retrieval, sandboxes
from .auth import (COOKIE, aware, current_account, issue_session, password_hash,
                   password_matches, public_account, remove_sessions, require_active, require_staff)
from .config import get_settings
from .domain import CourseMirrorRequest, WorkspaceCreateRequest
from .models import (AssignmentWorkspace, CoursePack, ExamPaper, ExamQuestion, KnowledgeNode,
                     LearningEvidenceRow, MirrorEvent, Problem, ProblemHint, TextbookChunk,
                     WorkspaceFinding)
from .platform_models import (Account, Attempt, Audit, CourseRevision, Hypothesis,
                              Observation, SandboxMember, SandboxPolicy, Submission)
from .registry import load_course_profiles
from .verification import evaluate_tools, verify
from .workspace_service import (create_workspace, generate_candidate_findings, finding_public,
                                decide_ta, decide_teacher, workspace_overview)
from .domain import TaDecisionRequest, TeacherDecisionRequest

router = APIRouter(prefix="/api/v2")
_attempt_locks = [RLock() for _ in range(64)]


def db_for(request: Request):
    with request.app.state.session_factory() as db:
        yield db


def user_for(request: Request, db=Depends(db_for)):
    user = current_account(request, db)
    if request.method in ("POST","PUT","PATCH","DELETE") and request.url.path not in (
        "/api/v2/me","/api/v2/me/delete","/api/v2/auth/logout"
    ):
        require_active(user)
    return user


def new_id():
    return uuid.uuid4().hex


def own_attempt(db, user, aid):
    attempt = db.get(Attempt, aid)
    if not attempt or attempt.account_id != user.id:
        raise HTTPException(404, "学习会话不存在")
    return attempt


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=6, max_length=128)


class Register(Credentials):
    nickname: str = Field(min_length=1, max_length=80)
    role: Literal["student", "teacher", "ta"] = "student"
    invite_code: str = Field(default="", max_length=128)


def login_cookie(response, token):
    settings = get_settings()
    response.set_cookie(COOKIE, token, httponly=True, secure=settings.secure_cookie,
                        samesite="strict", max_age=settings.session_hours*3600, path="/")


@router.get("/config")
def public_config():
    s = get_settings()
    return {"environment":s.environment, "default_retention_hours":168 if s.environment=="production" else 3,
            "model":s.llm_model if s.llm_provider!="stub" else "离线演示",
            "staff_registration_enabled":bool(s.staff_invite_code)}


@router.post("/auth/register")
def register(body: Register, response: Response, db=Depends(db_for)):
    settings = get_settings()
    if body.role != "student" and (not settings.staff_invite_code or
            not secrets.compare_digest(body.invite_code, settings.staff_invite_code)):
        raise HTTPException(403, "教师/TA注册需要开发团队提供的邀请码")
    user = Account(id=new_id(), username=body.username.lower(), nickname=body.nickname,
                   password_hash=password_hash(body.password), role=body.role)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "账号已存在")
    login_cookie(response, issue_session(db, user))
    return public_account(user)


@router.post("/auth/login")
def login(body: Credentials, response: Response, db=Depends(db_for)):
    user = db.execute(select(Account).where(Account.username==body.username.lower())).scalar_one_or_none()
    if not user or user.status=="deleted" or not password_matches(body.password,user.password_hash):
        raise HTTPException(401,"账号或口令不正确")
    login_cookie(response,issue_session(db,user))
    return public_account(user)


@router.post("/auth/logout")
def logout(request: Request, response: Response, db=Depends(db_for), user=Depends(user_for)):
    from .platform_models import LoginSession
    db.query(LoginSession).filter_by(
        token_hash=hashlib.sha256(request.cookies.get(COOKIE,"").encode()).hexdigest()).delete()
    db.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok":True}


@router.get("/me")
def me(user=Depends(user_for)):
    return public_account(user)


@router.get("/courses")
def courses(db=Depends(db_for), user=Depends(user_for)):
    profiles=load_course_profiles()
    return [{**p.model_dump(), "available":bool(db.execute(select(CoursePack).where(
        CoursePack.course_id==p.course_id)).first())}
        for p in profiles.values() if p.course_id!="ai_literacy"]


@router.get("/problems")
def problems(course_id: str, db=Depends(db_for), user=Depends(user_for)):
    packs=db.execute(select(CoursePack).where(CoursePack.course_id==course_id)).scalars().all()
    ids=[p.coursepack_id for p in packs]
    rows=db.execute(select(Problem).where(Problem.coursepack_id.in_(ids))).scalars().all()
    return [{"problem_id":p.problem_id,"coursepack_id":p.coursepack_id,"statement":p.statement,
             "review":p.review.get("status","unreviewed"),
             "max_hint_level":db.query(ProblemHint).filter_by(coursepack_id=p.coursepack_id,
                                                           problem_id=p.problem_id).count()}
            for p in rows if p.rights.get("allowed_for_runtime")
            and (p.provenance!="student_submitted" or p.review.get("status")=="student_approved")]


class AttemptCreate(BaseModel):
    course_id:str
    problem_id:str|None=None
    coursepack_id:str|None=None
    text:str=Field(default="",max_length=12000)
    sandbox_id:str|None=None


@router.post("/attempts")
def create_attempt(body:AttemptCreate,db=Depends(db_for),user=Depends(user_for)):
    require_active(user)
    profile=load_course_profiles().get(body.course_id)
    if not profile or body.course_id=="ai_literacy":
        raise HTTPException(400,"请选择数理课程")
    problem={"text":body.text.strip() or None,"problem_id":body.problem_id,
             "coursepack_id":body.coursepack_id}
    if body.problem_id:
        p=db.get(Problem,(body.coursepack_id,body.problem_id))
        pack=db.get(CoursePack,body.coursepack_id)
        if not p or not pack or pack.course_id!=body.course_id or not p.rights.get("allowed_for_runtime"):
            raise HTTPException(404,"题目不可用")
        if p.provenance=="student_submitted" and p.review.get("status")!="student_approved":
            raise HTTPException(404,"题目尚未发布")
        problem["text"]=p.statement
    elif not body.text.strip():
        raise HTTPException(422,"请输入题目或概念问题")
    if body.sandbox_id:
        policy=sandboxes.access(db,user,body.sandbox_id)
        ws=db.get(AssignmentWorkspace,body.sandbox_id)
        if ws.status!="open" or aware(policy.expires_at)<=datetime.now(UTC) or ws.course_id!=body.course_id:
            raise HTTPException(409,"Sandbox已结束或课程不匹配")
    row=Attempt(id=new_id(),account_id=user.id,course_id=body.course_id,profile_id=profile.profile_id,
                problem=problem,sandbox_id=body.sandbox_id)
    db.add(row);db.commit()
    return {"id":row.id,"problem":problem,"course_id":row.course_id,"sandbox_id":row.sandbox_id}


@router.get("/attempts")
def attempts(db=Depends(db_for),user=Depends(user_for)):
    rows=db.execute(select(Attempt).where(Attempt.account_id==user.id)
                    .order_by(Attempt.created_at.desc()).limit(100)).scalars().all()
    return [{"id":r.id,"course_id":r.course_id,"problem":r.problem,"sandbox_id":r.sandbox_id,
             "created_at":r.created_at.isoformat()} for r in rows]


@router.get("/attempts/{aid}")
def attempt_detail(aid:str,db=Depends(db_for),user=Depends(user_for)):
    row=own_attempt(db,user,aid)
    events=db.execute(select(MirrorEvent).where(MirrorEvent.participant_code==user.id,
                      MirrorEvent.request_payload["attempt_id"].as_string()==aid)
                      .order_by(MirrorEvent.occurred_at)).scalars().all()
    return {"id":row.id,"course_id":row.course_id,"problem":row.problem,"sandbox_id":row.sandbox_id,
            "events":[{"request_id":e.request_id,"message":e.request_payload.get("message",""),
                       "mode":e.interaction_mode,"response":e.response_json}
                      for e in events if e.request_payload.get("attempt_id")==aid]}


class Message(BaseModel):
    request_id:str=Field(min_length=8,max_length=128)
    mode:Literal["chat","first_hint","next_hint","full_solution","concept_explanation","solution_review"]="chat"
    message:str=Field(default="",max_length=6000)


@router.post("/attempts/{aid}/messages")
def send_message(aid:str,body:Message,request:Request,db=Depends(db_for),user=Depends(user_for)):
    with _attempt_locks[hash(aid) % len(_attempt_locks)]:
        return _send_message(aid,body,request,db,user)


@router.post("/attempts/{aid}/messages/stream")
def stream_message(aid: str, body: Message, request: Request, db=Depends(db_for), user=Depends(user_for)):
    from .course_stream import response_stream
    own_attempt(db, user, aid)
    user_id = user.id

    def work(progress):
        # Never share the dependency's SQLAlchemy session with a worker thread.
        with request.app.state.session_factory() as worker_db:
            account = worker_db.get(Account, user_id)
            if account is None:
                raise HTTPException(401, "登录状态已失效，请重新登录。")
            with _attempt_locks[hash(aid) % len(_attempt_locks)]:
                return _send_message(aid, body, request, worker_db, account, progress)

    return response_stream(work)


def _send_message(aid,body,request,db,user,on_progress=None):
    require_active(user)
    attempt=own_attempt(db,user,aid)
    if (request.app.state.pipeline.model.name == "stub"
            and (not get_settings().allow_stub_learning or get_settings().environment=="production")
            and attempt.course_id != "ai_literacy"):
        raise HTTPException(503,"课程助手暂不可用，请稍后重试。")
    # PostgreSQL串行化同一次尝试；SQLite测试/本地由请求锁保护。
    db.execute(select(Attempt).where(Attempt.id==aid).with_for_update()).scalar_one()
    sandbox=attempt.sandbox_id
    if sandbox:
        policy=sandboxes.access(db,user,sandbox)
        ws=db.get(AssignmentWorkspace,sandbox)
        if ws.status!="open" or aware(policy.expires_at)<=datetime.now(UTC):
            sandbox=None
    detail=attempt_detail(aid,db,user)
    history=[{"question":e["message"] or e["mode"],"answer":e["response"]["answer"]}
             for e in detail["events"][-6:]]
    payload=CourseMirrorRequest(request_id=body.request_id,course_id=attempt.course_id,
        course_profile_id=attempt.profile_id,problem=attempt.problem,interaction_mode=body.mode,
        participant_code=user.id,assignment_workspace_id=sandbox,attempt_id=aid,
        message=body.message,history=history,student_context=memory.context_for(db,user.id,attempt.course_id))
    response=request.app.state.pipeline.handle(db,payload,on_progress=on_progress)
    theme=memory.detect_theme(body.message)
    if theme:
        memory.add_observation(db,user.id,attempt.course_id,aid,"student_question",theme,
            "学生本次明确表达困惑："+body.message[:800],"support",
            observation_id="question:"+body.request_id)
        db.commit()
    return response.model_dump(mode="json")


class Feedback(BaseModel):
    request_id:str=Field(min_length=8,max_length=128)
    outcome:Literal["continued","solved","still_stuck","independent_success"]
    theme:Literal["conditions","quantifiers","construction"]
    note:str=Field(default="",max_length=1000)


@router.post("/attempts/{aid}/feedback")
def feedback(aid:str,body:Feedback,db=Depends(db_for),user=Depends(user_for)):
    require_active(user);attempt=own_attempt(db,user,aid)
    oid="feedback:"+body.request_id
    old=db.get(Observation,oid)
    if old and (old.account_id!=user.id or old.attempt_id!=aid or old.kind!=body.outcome):
        raise HTTPException(409,"反馈编号冲突")
    direction="support" if body.outcome=="still_stuck" else "contradict" if body.outcome=="independent_success" else "neutral"
    labels={"continued":"学生自报提示后可以继续","solved":"学生自报做出来了，独立性未验证",
            "still_stuck":"学生自报在该环节仍然卡住","independent_success":"学生自报独立完成；未经独立测试核验"}
    memory.add_observation(db,user.id,attempt.course_id,aid,body.outcome,body.theme,
                          labels[body.outcome]+("："+body.note if body.note else ""),
                          direction,source="self_report",observation_id=oid)
    db.commit();return memory.memory_view(db,user.id)


@router.get("/memory")
def get_memory(db=Depends(db_for),user=Depends(user_for)):
    return memory.memory_view(db,user.id)


class Correction(BaseModel):
    disputed:bool=True
    note:str=Field(min_length=1,max_length=1000)


@router.patch("/observations/{oid}")
def correct(oid:str,body:Correction,db=Depends(db_for),user=Depends(user_for)):
    require_active(user)
    row=db.get(Observation,oid)
    if not row or row.account_id!=user.id:
        raise HTTPException(404,"观察不存在")
    row.disputed=body.disputed;row.correction=body.note
    db.flush();memory.rebuild(db,user.id,row.course_id)
    sandboxes.audit(db,user.id,oid,"observation_correction",{"disputed":body.disputed})
    db.commit();return memory.memory_view(db,user.id)


class SandboxCreate(BaseModel):
    course_id:str
    title:str=Field(min_length=1,max_length=256)
    class_label:str=Field(default="",max_length=128)
    assignment:str=Field(default="",max_length=12000)
    retention_hours:int=Field(ge=1,le=720)
    retention_confirmed:Literal[True]
    class_size:int|None=Field(default=None,ge=1,le=10000)


def sandbox_view(db,user,policy):
    ws=db.get(AssignmentWorkspace,policy.workspace_id)
    return {"id":ws.workspace_id,"title":ws.title,"course_id":ws.course_id,
            "status":ws.status,"join_code":ws.join_code if policy.owner_id==user.id else None,
            "assignment":policy.assignment,"retention_hours":policy.retention_hours,
            "expires_at":aware(policy.expires_at).isoformat(),"class_size":policy.class_size,
            "purged":policy.purged_at is not None,"owner":policy.owner_id==user.id}


@router.post("/sandboxes")
def create_sandbox(body:SandboxCreate,db=Depends(db_for),user=Depends(user_for)):
    require_staff(user);require_active(user)
    if user.role!="teacher":
        raise HTTPException(403,"保留期须由教师确认创建")
    profile=load_course_profiles().get(body.course_id)
    if not profile or body.course_id=="ai_literacy":
        raise HTTPException(400,"课程不存在")
    ws=create_workspace(db,WorkspaceCreateRequest(course_id=body.course_id,
        course_profile_id=profile.profile_id,title=body.title,class_label=body.class_label))
    policy=SandboxPolicy(workspace_id=ws.workspace_id,owner_id=user.id,
        retention_hours=body.retention_hours,expires_at=datetime.now(UTC)+timedelta(hours=body.retention_hours),
        class_size=body.class_size,assignment=body.assignment)
    db.add(policy);sandboxes.audit(db,user.id,ws.workspace_id,"created",{"retention_hours":body.retention_hours})
    db.commit();return sandbox_view(db,user,policy)


@router.get("/sandboxes")
def list_sandboxes(db=Depends(db_for),user=Depends(user_for)):
    sandboxes.cleanup(db)
    memberships={m.workspace_id for m in db.execute(select(SandboxMember).where(
        SandboxMember.account_id==user.id)).scalars()}
    policies=db.execute(select(SandboxPolicy)).scalars().all()
    return [sandbox_view(db,user,p) for p in policies if p.owner_id==user.id or p.workspace_id in memberships]


class Join(BaseModel):
    code:str=Field(min_length=1,max_length=32)


@router.post("/sandboxes/join")
def join(body:Join,db=Depends(db_for),user=Depends(user_for)):
    require_active(user)
    ws=db.execute(select(AssignmentWorkspace).where(
        AssignmentWorkspace.join_code==body.code.strip().upper())).scalar_one_or_none()
    policy=db.get(SandboxPolicy,ws.workspace_id) if ws else None
    if not policy or ws.status!="open" or aware(policy.expires_at)<=datetime.now(UTC):
        raise HTTPException(404,"加入码无效或Sandbox已结束")
    if user.id!=policy.owner_id and not db.get(SandboxMember,(ws.workspace_id,user.id)):
        # 教师身份加入别人的Sandbox也只作为学生；TA权限由owner显式授予。
        db.add(SandboxMember(workspace_id=ws.workspace_id,account_id=user.id,role="student"))
        db.commit()
    return sandbox_view(db,user,policy)


class Retention(BaseModel):
    retention_hours:int=Field(ge=1,le=720)
    confirmed:Literal[True]


@router.patch("/sandboxes/{sid}/retention")
def retention(sid:str,body:Retention,db=Depends(db_for),user=Depends(user_for)):
    policy=sandboxes.access(db,user,sid,owner=True)
    ws=db.get(AssignmentWorkspace,sid)
    if ws.status!="open" or aware(policy.expires_at)<=datetime.now(UTC):
        raise HTTPException(409,"已结束的Sandbox不能延长")
    policy.retention_hours=body.retention_hours
    policy.expires_at=aware(ws.created_at)+timedelta(hours=body.retention_hours)
    sandboxes.audit(db,user.id,sid,"retention_changed",{"hours":body.retention_hours})
    db.commit();sandboxes.cleanup(db)
    return sandbox_view(db,user,policy)


class StaffAdd(BaseModel):
    username:str


@router.post("/sandboxes/{sid}/ta")
def add_ta(sid:str,body:StaffAdd,db=Depends(db_for),user=Depends(user_for)):
    policy=sandboxes.access(db,user,sid,owner=True)
    if policy.purged_at:
        raise HTTPException(409,"已清理")
    ta=db.execute(select(Account).where(Account.username==body.username.lower())).scalar_one_or_none()
    if not ta or ta.role!="ta":
        raise HTTPException(400,"请填写已注册TA账号")
    member=db.get(SandboxMember,(sid,ta.id))
    if not member:
        member=SandboxMember(workspace_id=sid,account_id=ta.id,role="ta");db.add(member)
    member.role="ta";db.commit();return {"ok":True}


@router.post("/sandboxes/{sid}/close")
def close(sid:str,db=Depends(db_for),user=Depends(user_for)):
    policy=sandboxes.access(db,user,sid,owner=True)
    if policy.frozen_report is None:
        sandboxes.close(db,policy,user.id)
    return policy.frozen_report


@router.delete("/sandboxes/{sid}")
def purge(sid:str,db=Depends(db_for),user=Depends(user_for)):
    policy=sandboxes.access(db,user,sid,owner=True)
    sandboxes.close(db,policy,user.id,purge=True)
    return {"ok":True,"report":policy.frozen_report}


@router.get("/sandboxes/{sid}/report")
def report(sid:str,db=Depends(db_for),user=Depends(user_for)):
    policy=sandboxes.access(db,user,sid,staff=True)
    return policy.frozen_report or sandboxes.snapshot(db,sid)


class Submit(BaseModel):
    text:str=Field(min_length=1,max_length=20000)
    source:Literal["artifact","independent"]="artifact"
    synthetic:bool=False
    participant_username:str|None=None
    explicit_submission:Literal[True]


@router.post("/sandboxes/{sid}/submissions")
def submit(sid:str,body:Submit,db=Depends(db_for),user=Depends(user_for)):
    require_active(user);policy=sandboxes.access(db,user,sid)
    ws=db.get(AssignmentWorkspace,sid)
    if ws.status!="open" or aware(policy.expires_at)<=datetime.now(UTC):
        raise HTTPException(409,"Sandbox已结束")
    target=user.id
    if body.participant_username:
        sandboxes.access(db,user,sid,staff=True)
        student=db.execute(select(Account).where(Account.username==body.participant_username.lower())).scalar_one_or_none()
        if not student or not db.get(SandboxMember,(sid,student.id)):
            raise HTTPException(400,"学生须先加入Sandbox")
        target=student.id
    if body.source=="independent":
        sandboxes.access(db,user,sid,staff=True)
    row=Submission(id=new_id(),workspace_id=sid,account_id=target,text=body.text,
                   source=body.source,synthetic=body.synthetic)
    db.add(row);db.commit();return {"id":row.id}


@router.get("/sandboxes/{sid}/submissions")
def submissions(sid:str,db=Depends(db_for),user=Depends(user_for)):
    sandboxes.access(db,user,sid,staff=True)
    rows=db.execute(select(Submission).where(Submission.workspace_id==sid)
                    .order_by(Submission.created_at)).scalars().all()
    return [{"id":s.id,"text":s.text,"source":s.source,"synthetic":s.synthetic,"review":s.review,
             "participant":db.get(Account,s.account_id).nickname if db.get(Account,s.account_id) else "已删除"}
            for s in rows]


class ArtifactReview(BaseModel):
    decision:Literal["confirmed","rejected","ignored","independent_success"]
    theme:Literal["conditions","quantifiers","construction"]
    note:str=Field(min_length=1,max_length=2000)


@router.post("/submissions/{submission_id}/preanalysis")
def preanalyse_artifact(submission_id:str,request:Request,db=Depends(db_for),user=Depends(user_for)):
    from .llm import MirrorContext
    row=db.get(Submission,submission_id)
    if not row:raise HTTPException(404,"作品不存在或已清理")
    policy=sandboxes.access(db,user,row.workspace_id,staff=True)
    if policy.frozen_report is not None or aware(policy.expires_at)<=datetime.now(UTC):
        raise HTTPException(409,"Sandbox已结束")
    ws=db.get(AssignmentWorkspace,row.workspace_id)
    profile=load_course_profiles()[ws.course_id]
    model=request.app.state.pipeline.model
    if model.name=="stub" and (not get_settings().allow_stub_learning or get_settings().environment=="production"):
        raise HTTPException(503,"辅助批改暂不可用，请稍后重试。")
    content=model.generate(MirrorContext(course_name=profile.display_name,
        mirror_name=profile.mirror_name,interaction_mode="artifact_review",
        problem_statement=policy.assignment or "教师未填写统一题干，请根据作品判断材料是否充分。",
        message=row.text))
    # 模型调用期间期限仍可能到达；过期结果不能重新写回。
    db.refresh(policy)
    if policy.purged_at or policy.frozen_report is not None or aware(policy.expires_at)<=datetime.now(UTC):
        raise HTTPException(409,"Sandbox已结束，未保存预审结果")
    row.review={**row.review,"candidate":{"text":content[:12000],"model":model.name,
        "at":datetime.now(UTC).isoformat(),"status":"unverified"}}
    sandboxes.audit(db,user.id,row.workspace_id,"artifact_preanalysis",{"submission_id":row.id})
    db.commit()
    return row.review["candidate"]


@router.post("/submissions/{submission_id}/review")
def review_artifact(submission_id:str,body:ArtifactReview,db=Depends(db_for),user=Depends(user_for)):
    row=db.get(Submission,submission_id)
    if not row:
        raise HTTPException(404,"作品不存在或已按期清理")
    policy=sandboxes.access(db,user,row.workspace_id,staff=True)
    if policy.frozen_report is not None:
        raise HTTPException(409,"报告已冻结")
    if body.decision=="independent_success" and row.source!="independent":
        raise HTTPException(400,"作业作品不能直接标记为独立掌握")
    before=row.review
    row.review={**body.model_dump(),"actor":user.id,"at":datetime.now(UTC).isoformat(),
                **({"candidate":before["candidate"]} if "candidate" in before else {})}
    ws=db.get(AssignmentWorkspace,row.workspace_id)
    # 改判时撤销旧观察，再重建，不把相互矛盾的批改都算成有效证据。
    oid="artifact:"+row.id
    old=db.get(Observation,oid)
    if old:
        db.delete(old);db.flush()
    if body.decision in ("confirmed","independent_success") and not row.synthetic:
        memory.add_observation(db,row.account_id,ws.course_id,None,"ta_review",body.theme,
            "正式提交作品的人工判断："+body.note,
            "support" if body.decision=="confirmed" else "contradict",
            source=row.source,strength="medium",observation_id=oid)
    memory.rebuild(db,row.account_id,ws.course_id)
    sandboxes.audit(db,user.id,row.workspace_id,"artifact_review",
                    {"submission_id":row.id,"before":before,"after":row.review})
    db.commit();return {"ok":True}


@router.post("/sandboxes/{sid}/insights")
def insights(sid:str,request:Request,db=Depends(db_for),user=Depends(user_for)):
    policy=sandboxes.access(db,user,sid,staff=True)
    if policy.frozen_report is not None:
        raise HTTPException(409,"Sandbox报告已冻结")
    if request.app.state.pipeline.model.name=="stub" and (not get_settings().allow_stub_learning or get_settings().environment=="production"):
        raise HTTPException(503,"暂时无法生成汇总，请稍后重试。")
    rows=generate_candidate_findings(db,sid,request.app.state.pipeline.model)
    return [finding_public(x) for x in rows]


@router.get("/sandboxes/{sid}/findings")
def findings(sid:str,db=Depends(db_for),user=Depends(user_for)):
    sandboxes.access(db,user,sid,staff=True)
    return [finding_public(r) for r in db.execute(select(WorkspaceFinding).where(
        WorkspaceFinding.workspace_id==sid)).scalars()]


class Decision(BaseModel):
    stage:Literal["ta","teacher"]
    decision:str
    note:str=Field(default="",max_length=512)


@router.post("/findings/{fid}/decision")
def decision(fid:str,body:Decision,db=Depends(db_for),user=Depends(user_for)):
    row=db.get(WorkspaceFinding,fid)
    if not row:raise HTTPException(404,"候选不存在")
    policy=sandboxes.access(db,user,row.workspace_id,staff=True,owner=body.stage=="teacher")
    if policy.frozen_report is not None:raise HTTPException(409,"报告已冻结")
    before=finding_public(row)
    if body.stage=="ta":
        if body.decision not in ("confirmed","rejected","ignored"):raise HTTPException(422,"不支持的决定")
        row=decide_ta(db,fid,TaDecisionRequest(decision=body.decision,note=body.note))
    else:
        if body.decision not in ("accepted","ignored"):raise HTTPException(422,"不支持的决定")
        row=decide_teacher(db,fid,TeacherDecisionRequest(decision=body.decision,note=body.note))
    sandboxes.audit(db,user.id,row.workspace_id,"finding_decision",{"before":before,"after":finding_public(row)})
    db.commit();return finding_public(row)


@router.get("/sandboxes/{sid}/audit")
def audit_log(sid:str,db=Depends(db_for),user=Depends(user_for)):
    sandboxes.access(db,user,sid,owner=True)
    return [{"action":a.action,"actor":a.actor_id,"at":a.created_at.isoformat(),"detail":a.detail}
            for a in db.execute(select(Audit).where(Audit.target==sid).order_by(Audit.created_at)).scalars()]


class Preferences(BaseModel):
    retention_days:int=Field(ge=1,le=1095)
    status:Literal["active","frozen"]


@router.patch("/me")
def preferences(body:Preferences,db=Depends(db_for),user=Depends(user_for)):
    user.retention_days=body.retention_days;user.status=body.status
    db.commit();return public_account(user)


@router.get("/me/export")
def export_me(db=Depends(db_for),user=Depends(user_for)):
    from .governance import export_account
    return export_account(db,user)


class DeleteAccount(BaseModel):
    password:str=Field(min_length=6,max_length=128)
    confirmed:Literal[True]


@router.post("/me/delete")
def delete_me(body:DeleteAccount,response:Response,db=Depends(db_for),user=Depends(user_for)):
    from .governance import delete_personal
    if not password_matches(body.password,user.password_hash):raise HTTPException(403,"口令不正确")
    # 自己拥有的Sandbox先冻结并清理，避免遗留可识别的作品与未完成任务。
    for policy in db.execute(select(SandboxPolicy).where(SandboxPolicy.owner_id==user.id)).scalars().all():
        sandboxes.close(db,policy,user.id,purge=True)
    delete_personal(db,user);response.delete_cookie(COOKIE,path="/")
    return {"deleted":True}


class Contribution(BaseModel):
    course_id:str
    title:str=Field(min_length=3,max_length=200)
    text:str=Field(min_length=5,max_length=12000)
    consent:Literal[True]


@router.post("/contributions")
def contribute(body:Contribution,db=Depends(db_for),user=Depends(user_for)):
    from .builder import revision
    require_active(user)
    pack=db.execute(select(CoursePack).where(CoursePack.course_id==body.course_id,
        ~CoursePack.coursepack_id.like("student-uploads-%"))).scalars().first()
    if not pack or body.course_id=="ai_literacy":raise HTTPException(400,"课程不存在")
    row=revision(db,user.id,pack.coursepack_id,
                 {"title":body.title,"text":body.text,"consent":True,
                  "usage":"共享题库候选；不允许参数训练；未判定课程归属"},"candidate")
    db.commit();return {"id":row.id,"status":row.status}


@router.get("/builder")
def builder_index(db=Depends(db_for),user=Depends(user_for)):
    from .builder import problem_document
    require_staff(user)
    packs=db.execute(select(CoursePack).where(CoursePack.course_id!="ai_literacy",
                      ~CoursePack.coursepack_id.like("student-uploads-%"))).scalars().all()
    return {"packs":[{"id":p.coursepack_id,"course_id":p.course_id,"status":p.status,
                     "problems":[problem_document(db,x) for x in db.execute(select(Problem).where(
                         Problem.coursepack_id==p.coursepack_id)).scalars()],
                     "knowledge":[{"id":k.knowledge_id,"title":k.title,"statement":k.statement,
                                   "review":k.review,"source":k.source}
                                  for k in db.execute(select(KnowledgeNode).where(
                                      KnowledgeNode.coursepack_id==p.coursepack_id)).scalars()]}
                    for p in packs],
            "revisions":[{"id":r.id,"coursepack_id":r.coursepack_id,"status":r.status,
                          "content":r.content,"evaluation":r.evaluation}
                         for r in db.execute(select(CourseRevision).order_by(CourseRevision.created_at.desc())
                                             .limit(100)).scalars()],
            "evaluation":evaluate_tools()}


class Publish(BaseModel):
    document:dict
    note:str=Field(min_length=5,max_length=2000)
    math_reviewed:Literal[True]
    in_course_scope:Literal[True]


@router.post("/builder/{pack_id}/publish")
def publish(pack_id:str,body:Publish,db=Depends(db_for),user=Depends(user_for)):
    from .builder import apply_problem
    require_staff(user)
    if user.role!="teacher":raise HTTPException(403,"发布由教师最终确认")
    pack=db.get(CoursePack,pack_id)
    if not pack or pack.course_id=="ai_literacy":raise HTTPException(400,"课程不可修改")
    row=apply_problem(db,pack_id,body.document,user.id,body.note)
    return {"id":row.id,"status":row.status}


class CandidateDecision(BaseModel):
    decision:Literal["rejected","eligible"]
    note:str=Field(min_length=3,max_length=1000)


@router.post("/builder/candidates/{rid}/review")
def candidate_review(rid:str,body:CandidateDecision,db=Depends(db_for),user=Depends(user_for)):
    require_staff(user);row=db.get(CourseRevision,rid)
    if not row or row.status not in ("candidate","eligible"):raise HTTPException(404,"候选不存在")
    row.status=body.decision
    row.content={**row.content,"scope_review":{"actor":user.id,"note":body.note}}
    sandboxes.audit(db,user.id,rid,"candidate_review",body.model_dump())
    db.commit();return {"id":row.id,"status":row.status}


class Rollback(BaseModel):
    note:str=Field(min_length=5,max_length=2000)
    confirmed:Literal[True]


@router.post("/builder/revisions/{rid}/rollback")
def rollback(rid:str,body:Rollback,db=Depends(db_for),user=Depends(user_for)):
    from .builder import apply_problem
    require_staff(user)
    if user.role!="teacher":raise HTTPException(403,"回滚由教师确认")
    row=db.get(CourseRevision,rid)
    if not row or row.status!="published" or not row.content.get("before"):
        raise HTTPException(409,"该版本没有可回滚的前一题目快照")
    result=apply_problem(db,row.coursepack_id,row.content["before"],user.id,body.note)
    return {"id":result.id,"status":result.status}


class Verification(BaseModel):
    tool:str
    data:dict


@router.post("/verify")
def verification(body:Verification,user=Depends(user_for)):
    try:return verify(body.tool,body.data)
    except (ValueError,KeyError,TypeError,ZeroDivisionError) as exc:
        raise HTTPException(422,"验证输入不合法："+str(exc)[:200])


@router.get("/eval")
def eval_results(user=Depends(user_for)):
    require_staff(user);return evaluate_tools()


class ImageInput(BaseModel):
    data_url:str=Field(max_length=6000000)


@router.post("/recognize")
def recognize(body:ImageInput,db=Depends(db_for),user=Depends(user_for)):
    import base64
    import httpx
    require_active(user)
    settings=get_settings()
    header,sep,encoded=body.data_url.partition(",")
    if not sep or header not in ("data:image/png;base64","data:image/jpeg;base64","data:image/webp;base64"):
        raise HTTPException(422,"仅支持PNG/JPEG/WebP")
    try:data=base64.b64decode(encoded,validate=True)
    except ValueError:raise HTTPException(422,"图片编码无效")
    if not data or len(data)>4*1024*1024:raise HTTPException(422,"图片请小于4MB")
    if settings.llm_provider=="stub":
        raise HTTPException(503,"离线模式不能识别图片，请先输入文字；真实模型需支持视觉输入")
    from .vision import transcribe
    text=transcribe(settings,body.data_url)
    return {"text":text,"requires_confirmation":True,
            "stored_image":False}


# ---------------------------------------------------------------- 教材库与全文搜索

import re as _re

def _parse_chapter_from_title(title: str | None) -> str | None:
    """从教材块标题提取章节名，如 '上册 · 第8章 反常积分 · ...' -> '第8章 反常积分'。"""
    if not title:
        return None
    for part in title.split("·"):
        part = part.strip()
        if part.startswith("第") and "章" in part:
            return part
    return None

@router.get("/textbooks")
def list_textbooks(course_id: str, db=Depends(db_for), user=Depends(user_for)):
    """列出某课程已录入的教材。"""
    rows = db.execute(
        select(TextbookChunk.source_id, func.count(TextbookChunk.chunk_id))
        .where(TextbookChunk.course_id == course_id)
        .group_by(TextbookChunk.source_id)
    ).all()
    result = []
    for source_id, count in rows:
        sample = db.execute(
            select(TextbookChunk).where(TextbookChunk.source_id == source_id).limit(1)
        ).scalar_one_or_none()
        volume = ""
        if sample and sample.title:
            parts = [p.strip() for p in sample.title.split("·")]
            if parts:
                volume = parts[0]
        source_info = sample.source if sample else {}
        book_title = source_info.get("book_title", "陈纪修《数学分析》")
        edition = source_info.get("edition", "第三版")
        # 统计章节数
        chapters = set()
        titles = db.execute(
            select(TextbookChunk.title).where(TextbookChunk.source_id == source_id)
        ).scalars().all()
        for t in titles:
            ch = _parse_chapter_from_title(t)
            if ch:
                chapters.add(ch)
        result.append({
            "source_id": source_id,
            "course_id": course_id,
            "title": book_title,
            "volume": volume,
            "edition": edition,
            "chunk_count": count,
            "chapter_count": len(chapters),
        })
    return result

@router.get("/textbooks/search")
def search_textbooks(course_id: str, q: str, limit: int = 20, db=Depends(db_for), user=Depends(user_for)):
    """全文搜索教材内容。"""
    if not q.strip():
        return []
    chunks = retrieval.search_textbook_chunks(db, course_id, q, limit=limit)
    return [{
        "chunk_id": c.chunk_id,
        "source_id": c.source_id,
        "title": c.title,
        "content": c.content,
        "locator": c.locator,
        "chapter": _parse_chapter_from_title(c.title),
    } for c in chunks]

class RelatedTextbookQuery(BaseModel):
    course_id: str = Field(max_length=100)
    text: str = Field(min_length=1, max_length=12000)


@router.post("/textbooks/related")
def related_textbooks(body: RelatedTextbookQuery, db=Depends(db_for), user=Depends(user_for)):
    from .retrieval_terms import concept_query
    # POST prevents private OCR text being placed in URLs and access logs.
    return search_textbooks(body.course_id, concept_query(body.text), 5, db, user)


@router.get("/textbooks/{source_id}/chapters")
def textbook_chapters(source_id: str, db=Depends(db_for), user=Depends(user_for)):
    """获取教材章节目录。"""
    titles = db.execute(
        select(TextbookChunk.title).where(TextbookChunk.source_id == source_id)
    ).scalars().all()
    chapter_order: dict[str, int] = {}
    for t in titles:
        ch = _parse_chapter_from_title(t)
        if ch and ch not in chapter_order:
            m = _re.search(r"第(\d+)章", ch)
            chapter_order[ch] = int(m.group(1)) if m else 999
    sorted_chapters = sorted(chapter_order.items(), key=lambda x: x[1])
    return [{"chapter": ch, "order": ord} for ch, ord in sorted_chapters]

@router.get("/textbooks/{source_id}/chunks")
def textbook_chunks(source_id: str, chapter: str | None = None, limit: int = 300, db=Depends(db_for), user=Depends(user_for)):
    """获取教材内容块，可按章节筛选。"""
    query = select(TextbookChunk).where(TextbookChunk.source_id == source_id)
    if chapter:
        query = query.where(TextbookChunk.title.contains(chapter, autoescape=True))
    query = query.order_by(TextbookChunk.locator).limit(limit)
    chunks = db.execute(query).scalars().all()
    return [{
        "chunk_id": c.chunk_id,
        "title": c.title,
        "content": c.content,
        "locator": c.locator,
    } for c in chunks]


# ---------------------------------------------------------------- 历年真题卷

@router.get("/exams")
def list_exams(course_id: str, db=Depends(db_for), user=Depends(user_for)):
    """列出某课程的历年真题卷。"""
    rows = db.execute(
        select(ExamPaper)
        .where(ExamPaper.course_id == course_id)
        .order_by(ExamPaper.year.desc(), ExamPaper.semester)
    ).scalars().all()
    return [{
        "paper_id": r.paper_id,
        "course_id": r.course_id,
        "title": r.title,
        "year": r.year,
        "semester": r.semester,
        "exam_type": r.exam_type,
        "question_count": r.question_count,
        "has_answers": r.has_answers,
        "total_score": r.total_score,
    } for r in rows]

@router.get("/exams/{paper_id}")
def exam_detail(paper_id: str, db=Depends(db_for), user=Depends(user_for)):
    """获取真题卷详情（含题目和答案）。"""
    paper = db.get(ExamPaper, paper_id)
    if not paper:
        raise HTTPException(404, "试卷不存在")
    questions = db.execute(
        select(ExamQuestion)
        .where(ExamQuestion.paper_id == paper_id)
        .order_by(ExamQuestion.number)
    ).scalars().all()
    return {
        "paper": {
            "paper_id": paper.paper_id,
            "course_id": paper.course_id,
            "title": paper.title,
            "year": paper.year,
            "semester": paper.semester,
            "exam_type": paper.exam_type,
            "question_count": paper.question_count,
            "has_answers": paper.has_answers,
            "total_score": paper.total_score,
        },
        "questions": [{
            "question_id": q.question_id,
            "number": q.number,
            "statement": q.statement,
            "answer": q.answer,
            "solution": q.solution,
            "knowledge_tags": q.knowledge_tags,
            "score": q.score,
        } for q in questions],
    }
