"""内测版真实HTTP闭环与边界回归；全部使用临时SQLite、合成内容和Stub。"""
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from mirror_api.config import REPO_ROOT
from mirror_api.coursepack import import_coursepack
from mirror_api.main import app, configure, _auth_attempts
from mirror_api.models import MirrorEvent, TextbookChunk
from mirror_api.platform_models import SandboxPolicy, Submission, Attempt
from mirror_api.seed import seed_profiles
from mirror_api.sandboxes import cleanup
from mirror_api.textbook_ingest import ingest_textbook
from mirror_api.verification import evaluate_tools

HEADERS={"X-Mirror-Request":"1"}
COURSE="mathematical_analysis"


@pytest.fixture()
def pilot(tmp_path,monkeypatch):
    monkeypatch.setenv("MIRROR_LLM_PROVIDER","stub")
    monkeypatch.setenv("MIRROR_ALLOW_STUB_LEARNING","true")
    monkeypatch.setenv("MIRROR_STAFF_INVITE_CODE","test-team-invite")
    configure(app,"sqlite:///"+str(tmp_path/"pilot.sqlite"))
    _auth_attempts.clear()
    with app.state.session_factory() as db:
        seed_profiles(db)
        for manifest in (REPO_ROOT/"coursepacks").glob("*/*/coursepack.json"):
            import_coursepack(db,manifest.parent)
    yield TestClient(app,headers=HEADERS)
    app.state.engine.dispose()


def register(client,name,role="student"):
    result=client.post("/api/v2/auth/register",json={"username":name,"password":"test-only-password",
        "nickname":name,"role":role,"invite_code":"test-team-invite"})
    assert result.status_code==200,result.text
    return result.json(),dict(client.cookies)


def account_client(cookies):
    return TestClient(app,headers=HEADERS,cookies=cookies)


def attempt(client,text="证明数列 1/n 收敛于0。"):
    r=client.post("/api/v2/attempts",json={"course_id":COURSE,"text":text})
    assert r.status_code==200,r.text
    return r.json()["id"]


def message(client,aid,rid,mode="first_hint",text=""):
    return client.post("/api/v2/attempts/"+aid+"/messages",json={"request_id":rid,"mode":mode,"message":text})


def sandbox(client):
    r=client.post("/api/v2/sandboxes",json={"course_id":COURSE,"title":"合成作业","retention_hours":3,
        "retention_confirmed":True,"class_size":20})
    assert r.status_code==200,r.text
    return r.json()


def test_public_learning_never_plays_stub_answers(pilot,monkeypatch):
    monkeypatch.setenv("MIRROR_ALLOW_STUB_LEARNING","false")
    register(pilot,"no_stub_student")
    aid=attempt(pilot)
    result=message(pilot,aid,"blocked-stub-request")
    assert result.status_code==503
    assert pilot.get("/api/v2/attempts/"+aid).json()["events"]==[]


def test_course_hints_are_generated_from_current_context(pilot):
    from mirror_api.llm import StubMirrorModel
    class DynamicModel(StubMirrorModel):
        name="test-dynamic"
        dynamic_hints=True
        contexts=[]
        def generate(self,context):
            self.contexts.append(context)
            return "先核对这一步需要哪些条件。"
    model=DynamicModel()
    app.state.pipeline.model=model
    register(pilot,"dynamic_student")
    p=next(p for p in pilot.get("/api/v2/problems",params={"course_id":COURSE}).json()
           if p["problem_id"]=="demo_limit_uniqueness_01")
    aid=pilot.post("/api/v2/attempts",json={"course_id":COURSE,
        "problem_id":p["problem_id"],"coursepack_id":p["coursepack_id"]}).json()["id"]
    for i in range(9):
        result=message(pilot,aid,"dynamic-request-"+str(i),
                       "first_hint" if i==0 else "next_hint","我不理解这里的条件")
        assert result.status_code==200,result.text
    assert all(c.dynamic_hints and not c.hints for c in model.contexts)
    assert [c.hint_level for c in model.contexts] == [1, 2, 3, 4, 5, 6, 7, 7, 7]
    assert [c.hints_exhausted for c in model.contexts] == [False] * 7 + [True] * 2
    assert model.contexts[-1].history
    assert model.contexts[-1].knowledge
    assert model.contexts[-1].message=="我不理解这里的条件"


def test_auth_roles_csrf_and_cross_account(pilot):
    anonymous=TestClient(app)
    assert anonymous.get("/api/v2/memory").status_code==401
    assert anonymous.post("/api/v2/auth/register",json={}).status_code==403
    rejected=pilot.post("/api/v2/auth/register",json={"username":"intruder","nickname":"x",
        "password":"test-only-password","role":"teacher","invite_code":"wrong"})
    assert rejected.status_code==403
    _,a=register(pilot,"student_a");ca=account_client(a)
    aid=attempt(ca)
    _,b=register(pilot,"student_b");cb=account_client(b)
    assert cb.get("/api/v2/attempts/"+aid).status_code==404
    assert cb.get("/api/v2/builder").status_code==403
    assert cb.post("/api/v2/sandboxes",json={"course_id":COURSE,"title":"x","retention_hours":3,"retention_confirmed":True}).status_code==403
    assert pilot.post("/api/v1/workspaces",json={}).status_code==410


def test_production_domain_can_register_and_restore_a_real_session(pilot,monkeypatch):
    monkeypatch.setenv("MIRROR_CORS_ORIGINS",
                       "https://learningmirror.cn,https://www.learningmirror.cn")
    body={"username":"domain_student","nickname":"域名学生",
          "password":"a-real-test-password","role":"student","invite_code":""}
    created=pilot.post("/api/v2/auth/register",json=body,
                       headers={"Origin":"https://learningmirror.cn"})
    assert created.status_code==200,created.text
    assert created.json()["username"]=="domain_student"
    assert created.cookies.get("mirror_session")
    assert pilot.get("/api/v2/me").json()["nickname"]=="域名学生"

    duplicate=pilot.post("/api/v2/auth/register",json=body,
                         headers={"Origin":"https://www.learningmirror.cn"})
    assert duplicate.status_code==409
    rejected=pilot.post("/api/v2/auth/register",json={**body,"username":"evil_origin"},
                        headers={"Origin":"https://example.com"})
    assert rejected.status_code==403


def test_six_character_password_and_public_login_wording(pilot):
    anonymous=TestClient(app,headers=HEADERS)
    unauthenticated=anonymous.get("/api/v2/me")
    assert unauthenticated.status_code==401
    assert unauthenticated.json()["detail"]=="请先登录账号"
    too_short=anonymous.post("/api/v2/auth/register",json={
        "username":"short_password","nickname":"短密码测试","password":"12345",
        "role":"student","invite_code":""})
    assert too_short.status_code==422
    created=anonymous.post("/api/v2/auth/register",json={
        "username":"six_password","nickname":"六位密码测试","password":"123456",
        "role":"student","invite_code":""})
    assert created.status_code==200,created.text
    anonymous.post("/api/v2/auth/logout")
    assert anonymous.post("/api/v2/auth/login",json={
        "username":"six_password","password":"123456"}).status_code==200


def test_hint_attempt_isolation_and_request_replay(pilot):
    register(pilot,"student_a")
    data=pilot.get("/api/v2/problems",params={"course_id":COURSE}).json()
    p=next(p for p in data if p["problem_id"]=="demo_limit_uniqueness_01")
    def create():return pilot.post("/api/v2/attempts",json={"course_id":COURSE,"problem_id":p["problem_id"],"coursepack_id":p["coursepack_id"]}).json()["id"]
    a=create()
    assert message(pilot,a,"first-request").json()["hint_level"]==1
    assert message(pilot,a,"second-request","next_hint").json()["hint_level"]==2
    b=create()
    assert message(pilot,b,"third-request").json()["hint_level"]==1
    result=message(pilot,b,"fourth-request","next_hint")
    assert result.status_code==200,result.text
    assert "提示阶梯已经用完" not in result.json()["answer"]
    replay=message(pilot,b,"fourth-request","next_hint")
    assert replay.json()==result.json()
    assert message(pilot,a,"fourth-request","next_hint").status_code==409


def test_personal_hypothesis_context_correction(pilot):
    register(pilot,"learner_one")
    for n in range(2):
        aid=attempt(pilot,"第"+str(n)+"道证明问题")
        result=message(pilot,aid,"question-"+str(n),text="我不懂定理条件为什么能用")
        assert result.status_code==200,result.text
    state=pilot.get("/api/v2/memory").json()
    assert state["hypotheses"][0]["status"]=="worth_attention"
    third=attempt(pilot)
    r=message(pilot,third,"personalized-request").json()
    assert r["decision"]["context"]["relevant_hypotheses"]
    assert "逐条" in r["answer"]
    for o in state["observations"]:
        c=pilot.patch("/api/v2/observations/"+o["id"],json={"disputed":True,"note":"我是在检查AI回答，并不是自己不会"})
        assert c.status_code==200,c.text
    assert not pilot.get("/api/v2/memory").json()["hypotheses"]
    r=message(pilot,attempt(pilot),"corrected-request").json()
    assert not r["decision"]["context"]["relevant_hypotheses"]


def test_opposite_evidence_and_private_solution(pilot):
    register(pilot,"learner_two")
    for n in range(2):
        aid=attempt(pilot)
        r=pilot.post("/api/v2/attempts/"+aid+"/feedback",json={"request_id":"feedback-"+str(n),
            "outcome":"still_stuck","theme":"quantifiers"})
        assert r.status_code==200
    r=pilot.post("/api/v2/attempts/"+aid+"/feedback",json={"request_id":"opposite-feedback",
        "outcome":"independent_success","theme":"quantifiers"})
    assert r.json()["hypotheses"][0]["status"]=="improving"
    full=message(pilot,aid,"private-full","full_solution")
    assert full.status_code==200
    assert "尚未完成审校" not in full.json()["answer"]
    # 自报独立成功仍明确为weak/self_report。
    assert any(o["source"]=="self_report" and o["strength"]=="weak" and o["direction"]=="contradict"
               for o in r.json()["observations"])


def test_teacher_sandbox_permissions_submission_purge(pilot):
    _,teacher=register(pilot,"teacher_one","teacher");tc=account_client(teacher)
    box=sandbox(tc);sid=box["id"]
    _,other=register(pilot,"teacher_two","teacher")
    assert account_client(other).get("/api/v2/sandboxes/"+sid+"/report").status_code==403
    student,scookies=register(pilot,"student_one");sc=account_client(scookies)
    assert sc.post("/api/v2/sandboxes/join",json={"code":box["join_code"]}).status_code==200
    aid=sc.post("/api/v2/attempts",json={"course_id":COURSE,"text":"私人对话不得进教师报告","sandbox_id":sid}).json()["id"]
    assert message(sc,aid,"private-event").status_code==200
    sub=sc.post("/api/v2/sandboxes/"+sid+"/submissions",json={"text":"公开提交：引用定理但没核对条件","explicit_submission":True}).json()["id"]
    assert sc.post("/api/v2/submissions/"+sub+"/preanalysis").status_code==403
    candidate=tc.post("/api/v2/submissions/"+sub+"/preanalysis")
    assert candidate.status_code==200,candidate.text
    assert candidate.json()["status"]=="unverified"
    assert sc.get("/api/v2/memory").json()["observations"]==[]
    reviewed=tc.post("/api/v2/submissions/"+sub+"/review",json={"decision":"confirmed","theme":"conditions","note":"第二行缺少单调性条件"})
    assert reviewed.status_code==200,reviewed.text
    assert sc.get("/api/v2/sandboxes/"+sid+"/report").status_code==403
    before=tc.get("/api/v2/sandboxes/"+sid+"/report").json()
    assert before["artifact_participants"]==1 and before["confirmed_issues"]==1
    assert "私人对话不得" not in str(before)
    tc.post("/api/v2/sandboxes/"+sid+"/close")
    fixed=tc.get("/api/v2/sandboxes/"+sid+"/report").json()
    assert tc.delete("/api/v2/sandboxes/"+sid).status_code==200
    assert tc.get("/api/v2/sandboxes/"+sid+"/report").json()==fixed
    with app.state.session_factory() as db:
        assert db.query(Submission).filter_by(workspace_id=sid).count()==0
        event=db.get(MirrorEvent,"private-event")
        assert event.assignment_workspace_id is None
        assert event.request_payload["assignment_workspace_id"] is None
        assert db.get(Attempt,aid).sandbox_id is None
        from mirror_api.platform_models import Audit
        assert all("第二行" not in str(a.detail) for a in db.query(Audit).filter_by(target=sid))
    assert sc.get("/api/v2/attempts/"+aid).status_code==200


def test_expiry_is_teacher_confirmed_and_enforced(pilot):
    register(pilot,"teacher_expiry","teacher")
    assert pilot.post("/api/v2/sandboxes",json={"course_id":COURSE,"title":"x","retention_hours":3}).status_code==422
    box=sandbox(pilot)
    with app.state.session_factory() as db:
        p=db.get(SandboxPolicy,box["id"]);p.expires_at=datetime.now(UTC)-timedelta(seconds=1);db.commit()
        assert cleanup(db)==1
        assert p.purged_at
    assert pilot.post("/api/v2/sandboxes/join",json={"code":box["join_code"]}).status_code==404


def test_export_freeze_delete(pilot):
    register(pilot,"student_delete")
    aid=attempt(pilot);assert message(pilot,aid,"delete-event").status_code==200
    assert pilot.get("/api/v2/me/export").json()["interactions"]
    assert pilot.patch("/api/v2/me",json={"retention_days":30,"status":"frozen"}).status_code==200
    assert message(pilot,aid,"frozen-event").status_code==409
    assert pilot.post("/api/v2/me/delete",json={"password":"test-only-password","confirmed":True}).status_code==200
    assert pilot.get("/api/v2/me").status_code==401
    with app.state.session_factory() as db:assert db.get(MirrorEvent,"delete-event") is None


def test_builder_publish_rollback_and_contribution(pilot):
    register(pilot,"student_contributor")
    r=pilot.post("/api/v2/contributions",json={"course_id":COURSE,"title":"共享自编题","text":"证明一条自己编写的数列命题","consent":True})
    assert r.status_code==200,r.text
    register(pilot,"teacher_builder","teacher")
    state=pilot.get("/api/v2/builder").json()
    pack=next(p for p in state["packs"] if p["course_id"]==COURSE)
    doc=pack["problems"][0]
    old=doc["statement"];doc["statement"]+="（测试修订）"
    r=pilot.post("/api/v2/builder/"+pack["id"]+"/publish",json={"document":doc,"note":"已检查解答及所有提示","math_reviewed":True,"in_course_scope":True})
    assert r.status_code==200,r.text
    rid=r.json()["id"]
    r=pilot.post("/api/v2/builder/revisions/"+rid+"/rollback",json={"note":"回到之前已保存的题目版本","confirmed":True})
    assert r.status_code==200,r.text
    after=pilot.get("/api/v2/builder").json()
    assert next(p for p in after["packs"] if p["id"]==pack["id"])["problems"][0]["statement"]==old


def test_chunk_retention_and_tool_counterexamples(pilot):
    class Extractor:
        def extract_text(self,path):return [(1,"A"*2400)]
    with app.state.session_factory() as db:
        count=ingest_textbook(db,REPO_ROOT/"README.md",COURSE,"synthetic",license_note="合成测试",extractor=Extractor())
        assert count==3
        assert db.query(TextbookChunk).filter_by(source_id="synthetic").count()==3
    result=evaluate_tools()
    assert result["passed"]==result["total"]==10


def test_harness_failure_is_blocked(pilot):
    from mirror_api.llm import StubMirrorModel
    from mirror_api.models import Problem
    register(pilot,"student_guard")
    with app.state.session_factory() as db:
        p=db.get(Problem,("analysis-chen-jixiu-3e","demo_limit_uniqueness_01"))
        leaked=p.solution_paths[0]["key_steps"][0]
    class Leaky:
        name="test-leaky"
        def generate(self,context):return leaked
    app.state.pipeline.model=Leaky()
    aid=pilot.post("/api/v2/attempts",json={"course_id":COURSE,"problem_id":"demo_limit_uniqueness_01",
        "coursepack_id":"analysis-chen-jixiu-3e"}).json()["id"]
    result=message(pilot,aid,"blocked-request").json()
    assert result["harness"]["status"]=="failed"
    assert leaked not in result["answer"]
    app.state.pipeline.model=StubMirrorModel()
