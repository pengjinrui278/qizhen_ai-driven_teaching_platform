import httpx
from conftest import make_request
from mirror_api.domain import InteractionMode
from mirror_api.platform_api import Message
from mirror_api.llm import MirrorContext, OpenAICompatibleModel
from mirror_api.mirror_service import MirrorPipeline

def test_chat_is_default_message_mode():
    assert Message(request_id="chat-default",message="自由提问").mode=="chat"

def test_chat_uses_current_question_and_history(monkeypatch):
    seen={}
    def post(url,**kwargs):
        seen.update(kwargs["json"])
        return httpx.Response(200,json={"choices":[{"finish_reason":"stop","message":{"content":"回答当前问题"}}]})
    monkeypatch.setattr(httpx,"post",post)
    model=OpenAICompatibleModel("https://api.deepseek.com","test-secret","deepseek-v4-pro")
    assert model.generate(MirrorContext(course_name="数学分析",mirror_name="数分",course_id="mathematical_analysis",
        interaction_mode="chat",message="请解释有界和收敛的区别",history=[{"question":"什么是极限","answer":"此前解释"}]))=="回答当前问题"
    assert "请解释有界和收敛的区别" in str(seen)
    assert "此前解释" in str(seen)
    assert "自然的连续问答" in seen["messages"][0]["content"] or "连续" in seen["messages"][0]["content"]

def test_chat_retrieves_latest_question_not_only_preset(session,monkeypatch):
    import mirror_api.mirror_service as service
    seen={}
    def search(db,ids,text):
        seen["query"]=text
        return []
    monkeypatch.setattr(service,"search_knowledge",search)
    class Model:
        name="chat-test"
        dynamic_hints=True
        def generate(self,ctx):
            seen["context"]=ctx
            return "合成测试回答"
    request=make_request("free-chat-test","chat",problem_id="demo_limit_uniqueness_01")
    request.message="现在改问有界性"
    result=MirrorPipeline(Model()).handle(session,request)
    assert seen["query"].startswith(request.message)
    assert seen["context"].interaction_mode=="chat"
    assert seen["context"].hints==[]
    assert result.hint_level is None
