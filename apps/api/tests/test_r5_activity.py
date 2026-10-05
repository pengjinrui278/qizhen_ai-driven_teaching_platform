import httpx
import pytest
from sqlalchemy import select
from test_platform import pilot, register, message, COURSE  # noqa: F401
from mirror_api.main import app
from mirror_api.platform_models import Audit,Account
from mirror_api.model_transport import ModelError
from mirror_api.governance import delete_personal,expire_personal
from datetime import UTC,datetime,timedelta
from mirror_api.llm import OpenAICompatibleModel,MirrorContext


def start(client,text='比较一致收敛与逐点收敛的区别'):
    r=client.post('/api/v2/attempts',json={'course_id':COURSE,'text':text})
    assert r.status_code==200
    assert r.json()['title']!=text
    assert r.json()['created_at'].endswith('+00:00')
    return r.json()['id']


def test_all_questions_visible_without_difficulty_keywords_and_retries_deduplicate(pilot):
    register(pilot,'activity-owner');aid=start(pilot)
    r=message(pilot,aid,'activity-turn','chat');assert r.status_code==200
    rows=pilot.get('/api/v2/memory').json()['activities']
    assert len(rows)==1 and rows[0]['status']=='answered'
    assert rows[0]['request_id']=='activity-turn' and rows[0]['attempt_id']==aid
    assert '一致收敛' in rows[0]['topics']
    assert pilot.get('/api/v2/memory').json()['hypotheses']==[]
    message(pilot,aid,'activity-turn','chat')
    assert len(pilot.get('/api/v2/memory').json()['activities'])==1
    register(pilot,'activity-other')
    assert pilot.get('/api/v2/memory').json()['activities']==[]


def test_failure_persists_question_then_retry_updates_same_activity(pilot,monkeypatch):
    register(pilot,'failed-activity');aid=start(pilot)
    original=app.state.pipeline.model.generate
    def fail(*a,**k):raise ModelError(502,'synthetic truncation')
    monkeypatch.setattr(app.state.pipeline.model,'generate',fail)
    assert message(pilot,aid,'failed-turn','chat').status_code==502
    rows=pilot.get('/api/v2/memory').json()['activities'];assert len(rows)==1 and rows[0]['status']=='failed' and rows[0]['question']
    assert pilot.get('/api/v2/attempts/'+aid).json()['events']==[]
    monkeypatch.setattr(app.state.pipeline.model,'generate',original)
    assert message(pilot,aid,'failed-turn','chat').status_code==200
    rows=pilot.get('/api/v2/memory').json()['activities'];assert len(rows)==1 and rows[0]['status']=='answered'


def test_old_events_visible_and_personal_delete_cleans_activity_payload(pilot):
    user,_=register(pilot,'activity-delete');aid=start(pilot);message(pilot,aid,'old-turn','chat')
    with app.state.session_factory() as db:
        db.query(Audit).filter_by(actor_id=user['id'],action='course_activity').delete();db.commit()
    assert pilot.get('/api/v2/memory').json()['activities'][0]['request_id']=='old-turn'
    message(pilot,aid,'second-turn','chat')
    with app.state.session_factory() as db:
        delete_personal(db,db.get(Account,user['id']))
        assert not list(db.scalars(select(Audit).where(Audit.action=='course_activity')))


def test_retention_cleans_activity_journal(pilot):
    user,_=register(pilot,'activity-expiry');aid=start(pilot);message(pilot,aid,'expiry-turn','chat')
    with app.state.session_factory() as db:
        account=db.get(Account,user['id'])
        expire_personal(db,datetime.now(UTC)+timedelta(days=account.retention_days+1))
        assert not list(db.scalars(select(Audit).where(Audit.actor_id==user['id'],Audit.action=='course_activity')))
    assert pilot.get('/api/v2/memory').json()['activities']==[]


def test_feedback_overview_does_not_read_private_transcripts(pilot,monkeypatch):
    register(pilot,'overview-only');aid=start(pilot);message(pilot,aid,'overview-turn','chat')
    from mirror_api import learning_activity
    def forbidden(*a,**k):raise AssertionError('overview must not query full activity history')
    monkeypatch.setattr(learning_activity,'view',forbidden)
    response=pilot.get('/api/v2/memory?include_activities=false')
    assert response.status_code==200
    assert 'activities' not in response.json()
    assert response.json()=={'observations':[],'hypotheses':[]}


def test_request_id_cannot_be_reused_for_other_session(pilot):
    register(pilot,'activity-conflict');aid=start(pilot);message(pilot,aid,'shared-turn','chat')
    other=start(pilot,'求解电路电流')
    assert message(pilot,other,'shared-turn','chat').status_code==409
    answered=[r for r in pilot.get('/api/v2/memory').json()['activities'] if r['status']=='answered']
    assert len(answered)==1 and answered[0]['attempt_id']==aid


@pytest.mark.parametrize('mode,level,course,budget,effort',[
    ('chat',None,COURSE,32768,'low'),('first_hint',1,COURSE,32768,'low'),
    ('next_hint',2,COURSE,32768,'low'),('next_hint',3,COURSE,65536,'high'),
    ('full_solution',None,COURSE,65536,'high'),('solution_review',None,COURSE,65536,'high'),
    ('chat',3,'ai_literacy',32768,None)])
def test_budget_tiers(mode,level,course,budget,effort,monkeypatch):
    seen=[]
    def post(*a,**kw):
        seen.append(kw['json']);return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':'complete'}}]})
    monkeypatch.setattr(httpx,'post',post)
    model=OpenAICompatibleModel('https://api.deepseek.com','fixture','deepseek-flash',max_tokens=32768,deep_max_tokens=65536)
    model.generate(MirrorContext(course_name='数学分析',mirror_name='Mirror',course_id=course,interaction_mode=mode,hint_level=level,message='继续'))
    assert seen[0]['max_tokens']==budget and seen[0].get('reasoning_effort')==effort
    assert len(seen)==1
