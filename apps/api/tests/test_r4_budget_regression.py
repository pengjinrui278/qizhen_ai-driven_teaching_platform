import httpx
from mirror_api.config import Settings
from mirror_api.llm import OpenAICompatibleModel, MirrorContext


def test_default_reasoning_does_not_force_high_at_small_output_budget(monkeypatch):
    monkeypatch.delenv('MIRROR_LLM_REASONING_EFFORT',raising=False)
    assert Settings(_env_file=None).llm_reasoning_effort=='low'
    payloads=[]
    def post(*args,**kwargs):
        payloads.append(kwargs['json'])
        return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':'verified synthetic answer'}}]})
    monkeypatch.setattr(httpx,'post',post)
    model=OpenAICompatibleModel('https://api.deepseek.com','fixture','deepseek-flash',max_tokens=8192)
    model.generate(MirrorContext(course_name='数分',mirror_name='数分',course_id='mathematical_analysis',interaction_mode='full_solution'))
    assert len(payloads)==1
    assert payloads[0]['thinking']=={'type':'enabled'}
    assert payloads[0]['reasoning_effort']=='low'
    assert payloads[0]['max_tokens']==8192
