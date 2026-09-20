"""Explicit opt-in live integration check. Uses synthetic questions and in-memory accounts only."""
import json
from fastapi.testclient import TestClient
from mirror_api.config import Settings, REPO_ROOT
from mirror_api.main import app, configure
from mirror_api.seed import seed_profiles
from mirror_api.coursepack import import_coursepack

def main():
    settings=Settings()
    if settings.llm_provider!="openai_compatible" or settings.llm_base_url!="https://api.deepseek.com" or not settings.llm_api_key:
        raise SystemExit("Official provider configuration is incomplete.")
    configure(app,"sqlite:///:memory:")
    with app.state.session_factory() as db:
        seed_profiles(db)
        for manifest in (REPO_ROOT/"coursepacks"/"mathematical_analysis").glob("*/coursepack.json"):
            import_coursepack(db,manifest.parent)
    client=TestClient(app,headers={"X-Mirror-Request":"1"})
    r=client.post("/api/v2/auth/register",json={"username":"live_agent_check","password":"synthetic-test-only-password",
        "nickname":"合成验收","role":"student"})
    assert r.status_code==200
    course="mathematical_analysis"
    question="用定义证明数列1/n收敛于0。"
    for index in range(2):
        a=client.post("/api/v2/attempts",json={"course_id":course,"text":question}).json()
        f=client.post("/api/v2/attempts/"+a["id"]+"/feedback",json={
            "request_id":"synthetic-feedback-"+str(index),"outcome":"still_stuck","theme":"quantifiers","note":""})
        assert f.status_code==200
    aid=client.post("/api/v2/attempts",json={"course_id":course,"text":question}).json()["id"]
    results=[]
    turns=[("first_hint","我不知道怎么开始。"),("next_hint","我写出了对任意正数ε，想选一个N，但不知道它可以依赖什么。")]
    for i,(mode,message) in enumerate(turns):
        r=client.post("/api/v2/attempts/"+aid+"/messages",json={
            "request_id":"official-live-"+str(i),"mode":mode,"message":message})
        if r.status_code!=200:
            print(json.dumps({"passed":False,"stage":mode,"status":r.status_code},ensure_ascii=False))
            return
        v=r.json()
        assert v["model"]=="openai_compatible:"+settings.llm_model
        assert v["decision"]["context"]["relevant_hypotheses"]
        results.append({"mode":mode,"answer":v["answer"],"harness":v["harness"]["status"],
                        "context_present":True,"policy":v["decision"]["policy_version"]})
    detail=client.get("/api/v2/attempts/"+aid).json()
    assert len(detail["events"])==2
    print(json.dumps({"passed":True,"calls":2,"results":results,
        "scope":"synthetic integration only; not textbook or teaching-quality certification"},ensure_ascii=False))
    app.state.engine.dispose()

if __name__=="__main__":
    main()
