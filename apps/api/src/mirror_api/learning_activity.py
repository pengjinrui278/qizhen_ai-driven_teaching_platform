"""Private per-turn activity journal; never an ability diagnosis or training grant."""
import hashlib
import re
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select

from .models import MirrorEvent
from .platform_models import Attempt, Audit
from .registry import load_course_profiles

ACTION = 'course_activity'
TOPICS = ('一致收敛','逐点收敛','三角不等式','量词','极限','连续','可微','导数','积分','级数','紧致','连通','矩阵','特征值','向量空间','线性映射','微分方程','初值','节点电压','基尔霍夫','电阻','电容','电感','电路','能量守恒','牛顿','动量','电磁','相关','因果','记忆','认知','情绪','概率','条件','构造','递归','循环','列表','字典','异常','调试','语法','阅读','写作','词汇','although','however','python','epsilon','delta')


def timestamp(value):
    return (value if value.tzinfo else value.replace(tzinfo=UTC)).isoformat()


def topics(text):
    return [word for word in TOPICS if word.casefold() in text.casefold()][:5]


# 引用追问的首行标记，与前端 chat-quote.mjs 的 QUOTE_HEADER 是同一个串。
# 会话列表靠它在标题里认出「这是某条主对话分出来的追问」，从而折叠到父词条下。
# 早先没带这个标记，前端那条识别通道形同虚设：父对话一删，游离的追问就带着
# 一个通用标题（好几个还重名）挤在侧栏顶层。
QUOTE_HEADER = '【引用追问】'


_FILLER_RE = re.compile(
    r'^(?:请|如何|求证|证明|设|已知|给定|若|对于|关于|试|求|讨论|比较|判断|说明|写出|计算|求解|解|请证明|请说明|证明设|求证设)\s*',
    re.I,
)


def _topic_phrase(text):
    """从题干抽一个具体短语作为标题主题：去引导词、取首个分句、截短。"""
    t = _FILLER_RE.sub('', text.strip())
    t = re.split(r'[，。；;！？!?\n]', t, 1)[0].strip()
    t = re.sub(r'\s+', ' ', t)
    t = re.sub(r'[^\w一-鿿·（）()：:、\s-]', '', t, flags=re.UNICODE)
    return t[:16].strip()


def summarize(text, course):
    text = text or ''
    following_up = text.lstrip().startswith(QUOTE_HEADER)
    matched = topics(text)
    intent = next((label for pattern,label in [(r'证明|prove','证明思路'),(r'比较|区别|difference','概念比较'),(r'计算|求解|求导','求解方法'),(r'调试|报错|debug','代码调试'),(r'写作|作文|邮件|essay','表达练习')] if re.search(pattern,text,re.I)), '概念讨论')
    name = load_course_profiles().get(course)
    if matched:
        subject = '与'.join(matched[:2])
    else:
        subject = _topic_phrase(text) or (name.display_name if name else '课程')
    # 追问的标题带上标记：前端据此把它折到父词条下，而不是当成一条独立对话。
    # 标记会占掉标题长度，所以给正文留的额度相应减少，别把「· 意图」截没了。
    head = QUOTE_HEADER if following_up else ''
    return (head + subject + ' · ' + intent)[:60 + len(head)]


def activity_key(user, request_id):
    return hashlib.sha256(('activity:'+user+':'+request_id).encode()).hexdigest()


def start(db, user, attempt, body):
    key=activity_key(user,body.request_id)
    row=db.get(Audit,key)
    question=body.message or attempt.problem.get('text','')
    if row and any(row.detail.get(k)!=v for k,v in {'attempt_id':attempt.id,'question':question,'mode':body.mode}.items()):
        raise HTTPException(409,'请求编号已用于其他问题，请重新发送')
    if not row:
        row=Audit(id=key,actor_id=user,target=attempt.id,action=ACTION,detail={
            'request_id':body.request_id,'attempt_id':attempt.id,'course_id':attempt.course_id,
            'question':question,'mode':body.mode,'status':'pending','summary':summarize(question,attempt.course_id),
            'topics':topics(question),'citations':[]})
        db.add(row)
    elif row.detail.get('status')!='answered':
        row.detail={**row.detail,'status':'pending','updated_at':datetime.now(UTC).isoformat()}
    db.commit()
    return key


def finish(db, key, response=None):
    row=db.get(Audit,key)
    if not row: return  # Account/retention cleanup must not be undone by late generation.
    data=dict(row.detail)
    data.update(status='failed' if response is None else 'blocked' if response.harness.status=='failed' else 'answered',updated_at=datetime.now(UTC).isoformat())
    if response is not None:
        data.update(citations=[c.model_dump() for c in response.citations],hint_level=response.hint_level,
                    hint_scale_version=response.decision.get('hint_scale_version'))
    row.detail=data
    db.commit()


def view(db, user):
    attempts={a.id:a for a in db.scalars(select(Attempt).where(Attempt.account_id==user,Attempt.course_id!='ai_literacy'))}
    result={}
    for row in db.scalars(select(Audit).where(Audit.actor_id==user,Audit.action==ACTION)):
        data=row.detail
        if data.get('attempt_id') not in attempts:continue
        original=attempts[data['attempt_id']].problem.get('text','')
        result[data['request_id']]={**data,'original_question':original,'topics':topics(data.get('question','')+' '+original),'created_at':timestamp(row.created_at)}
        started=datetime.fromisoformat(data.get('updated_at') or timestamp(row.created_at))
        if data.get('status')=='pending' and datetime.now(UTC)-started>timedelta(minutes=10):
            result[data['request_id']]['status']='unconfirmed'
    # Old successful history is visible immediately; no copied transcript/backfill writes.
    for event in db.scalars(select(MirrorEvent).where(MirrorEvent.participant_code==user)):
        aid=event.request_payload.get('attempt_id')
        if aid not in attempts:continue
        attempt=attempts[aid];r=event.response_json
        question=event.request_payload.get('message') or attempt.problem.get('text','')
        result[event.request_id]={**result.get(event.request_id,{}),'request_id':event.request_id,
            'attempt_id':aid,'course_id':event.course_id,'question':question,'mode':event.interaction_mode,
            'summary':summarize(question+' '+attempt.problem.get('text',''),event.course_id),'topics':topics(question+' '+attempt.problem.get('text','')),'original_question':attempt.problem.get('text',''),
            'status':'blocked' if r.get('harness',{}).get('status')=='failed' else 'answered',
            'created_at':timestamp(event.occurred_at),'citations':r.get('citations',[]),
            'hint_level':event.hint_level,'hint_scale_version':r.get('decision',{}).get('hint_scale_version')}
    covered={r['attempt_id'] for r in result.values()}
    for aid,a in attempts.items():
        if aid not in covered:
            text=a.problem.get('text','')
            result['session:'+aid]={'request_id':None,'attempt_id':aid,'course_id':a.course_id,
                'question':text,'summary':summarize(text,a.course_id),'topics':topics(text),
                'status':'no_completed_answer','created_at':timestamp(a.created_at),'citations':[]}
    return sorted(result.values(),key=lambda r:r['created_at'],reverse=True)
