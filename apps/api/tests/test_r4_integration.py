"""Coordinator regressions for the frozen R4 cross-team contract."""
from test_platform import pilot, register, message, COURSE  # noqa: F401
from mirror_api.main import app
from mirror_api.platform_models import Attempt


def test_history_pages_keep_older_records_and_ownership(pilot):
    user, cookies = register(pilot, 'history-owner')
    with app.state.session_factory() as db:
        for i in range(103):
            db.add(Attempt(id=f'page-{i:03}',account_id=user['id'],course_id=COURSE,
                           profile_id='test',problem={'text':'synthetic'}))
        db.commit()
    first=pilot.get('/api/v2/attempts').json()
    second=pilot.get('/api/v2/attempts?offset=100&limit=100').json()
    assert len(first)==100 and len(second)==3
    assert not ({r['id'] for r in first}&{r['id'] for r in second})
    old=second[-1]['id']
    assert pilot.get('/api/v2/attempts/'+old).status_code==200
    register(pilot,'history-other')
    assert pilot.get('/api/v2/attempts?offset=100').json()==[]
    assert pilot.get('/api/v2/attempts/'+old).status_code==404


def test_three_level_version_survives_history_and_replay(pilot):
    register(pilot,'scale-owner')
    aid=pilot.post('/api/v2/attempts',json={'course_id':COURSE,'text':'synthetic exercise'}).json()['id']
    result=message(pilot,aid,'scale-request','full_solution')
    assert result.status_code==200
    value=result.json()
    assert value['hint_level']==3
    assert value['decision']['hint_scale_version']=='course-hints-v1-three'
    assert value['decision']['hint_max_level']==3
    assert message(pilot,aid,'scale-request','full_solution').json()==value
    assert pilot.get('/api/v2/attempts/'+aid).json()['events'][0]['response']==value
