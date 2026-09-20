import httpx
import pytest
from mirror_api.llm import MirrorContext, OpenAICompatibleModel
from mirror_api.model_transport import complete, ModelError

def test_official_reasoning_payload_and_course_policy(monkeypatch):
    seen={}
    def post(url,**kwargs):
        seen.update(url=url,**kwargs)
        return httpx.Response(200,json={"choices":[{"finish_reason":"stop","message":{"content":"先检查量词顺序。"}}]})
    monkeypatch.setattr(httpx,"post",post)
    model=OpenAICompatibleModel("https://api.deepseek.com","test-secret","deepseek-flash")
    answer=model.generate(MirrorContext(course_name="数学分析",mirror_name="数分",interaction_mode="next_hint",
        course_id="mathematical_analysis",dynamic_hints=True,hints=[{"content":"DO_NOT_PLAY"}],
        message="我不懂N的依赖",history=[{"question":"第一步","answer":"先写定义"}]))
    assert answer=="先检查量词顺序。"
    payload=seen["json"]
    assert payload["thinking"]=={"type":"enabled"}
    assert payload["max_tokens"]==4096
    assert "量词顺序" in payload["messages"][0]["content"]
    assert "DO_NOT_PLAY" not in str(payload)
    assert "先写定义" in str(payload)
    assert not seen["follow_redirects"]

@pytest.mark.parametrize("status",[401,402,429,500,302])
def test_provider_errors_never_echo_secrets(monkeypatch,status):
    monkeypatch.setattr(httpx,"post",lambda *a,**kw:httpx.Response(status,text="test-secret private body"))
    with pytest.raises(ModelError) as exc:
        complete("https://api.deepseek.com","test-secret",{},1)
    assert "test-secret" not in str(exc.value)
    assert "private body" not in str(exc.value)

def test_truncated_output_not_presented_as_complete(monkeypatch):
    monkeypatch.setattr(httpx,"post",lambda *a,**kw:httpx.Response(200,json={
        "choices":[{"finish_reason":"length","message":{"content":"unfinished proof"}}]}))
    with pytest.raises(ModelError):
        complete("https://api.deepseek.com","test-secret",{},1)

def test_timeout_no_automatic_paid_retry(monkeypatch):
    calls=[]
    def post(*a,**kw):
        calls.append(1)
        raise httpx.ReadTimeout("sensitive body")
    monkeypatch.setattr(httpx,"post",post)
    with pytest.raises(ModelError) as exc:
        complete("https://api.deepseek.com","test-secret",{},1)
    assert exc.value.status_code==504 and len(calls)==1

def test_vision_uses_separate_model_without_reasoning(monkeypatch):
    from mirror_api.config import Settings
    from mirror_api.vision import transcribe
    seen={}
    def post(url,**kwargs):
        seen.update(kwargs["json"])
        return httpx.Response(200,json={"choices":[{"finish_reason":"stop","message":{"content":"转写"}}]})
    monkeypatch.setattr(httpx,"post",post)
    settings=Settings(_env_file=None,llm_provider="openai_compatible",
        llm_base_url="https://api.deepseek.com",llm_api_key="test-secret",llm_model="deepseek-flash")
    assert transcribe(settings,"data:image/png;base64,synthetic")=="转写"
    assert seen["model"]=="deepseek-flash"
    assert seen["thinking"]=={"type":"disabled"}

def test_memory_database_visible_in_worker_thread():
    from concurrent.futures import ThreadPoolExecutor
    from sqlalchemy import text
    from mirror_api.db import make_engine
    engine=make_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE integration_probe (id INTEGER)"))
        connection.execute(text("INSERT INTO integration_probe VALUES (7)"))
    def read():
        with engine.connect() as connection:
            return connection.execute(text("SELECT id FROM integration_probe")).scalar_one()
    with ThreadPoolExecutor(max_workers=1) as worker:
        assert worker.submit(read).result()==7
    engine.dispose()

def test_intake_drafts_never_publish_or_overwrite_review(tmp_path):
    import json
    from mirror_api.textbook_intake import save_draft
    source=tmp_path/"synthetic.pdf"
    source.write_bytes(b"%PDF-synthetic-source")
    destination=save_draft(tmp_path/"intake",source,1,"unreviewed text","fixture")
    value=json.loads(destination.read_text(encoding="utf-8"))
    assert value["status"]=="needs_review"
    assert value["rights"]=={"allowed_for_rag":False,"allowed_for_training":False}
    save_draft(tmp_path/"intake",source,1,"replacement","fixture")
    assert json.loads(destination.read_text(encoding="utf-8"))["text"]=="unreviewed text"
