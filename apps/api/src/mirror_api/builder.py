"""课程建设：显式贡献、人工审查、不可变快照与回滚。"""
import copy
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select

from .coursepack import ProblemItem
from .models import CoursePack, KnowledgeNode, Problem, ProblemHint, ProblemKnowledge
from .platform_models import CourseRevision
from .verification import evaluate_tools


def problem_document(db, p):
    hints=db.execute(select(ProblemHint).where(
        ProblemHint.coursepack_id==p.coursepack_id,ProblemHint.problem_id==p.problem_id)
        .order_by(ProblemHint.level)).scalars().all()
    return {"id":p.problem_id,"type":p.type,"provenance":p.provenance,"statement":p.statement,
            "answer_type":p.answer_type,"solution_paths":p.solution_paths,"common_mistakes":p.common_mistakes,
            "rights":p.rights,"review":p.review,
            "knowledge_ids":list(db.execute(select(ProblemKnowledge.knowledge_id).where(
                ProblemKnowledge.coursepack_id==p.coursepack_id,
                ProblemKnowledge.problem_id==p.problem_id)).scalars()),
            "hint_ladder":[{"level":h.level,"type":h.hint_type,"content":h.content} for h in hints]}


def revision(db,user,pack_id,content,status="draft"):
    row=CourseRevision(id=uuid.uuid4().hex,coursepack_id=pack_id,actor_id=user,
                       content=copy.deepcopy(content),status=status,evaluation=evaluate_tools())
    db.add(row);db.flush()
    return row


def apply_problem(db,pack_id,document,reviewer,note):
    try:
        item=ProblemItem.model_validate(document)
    except ValidationError as exc:
        raise HTTPException(422,"题目结构不合法："+str(exc)[:500])
    if not item.solution_paths or not item.hint_ladder:
        raise HTTPException(422,"发布需要完整参考解法与提示阶梯")
    if [h.level for h in item.hint_ladder]!=list(range(1,len(item.hint_ladder)+1)):
        raise HTTPException(422,"提示级别须从1连续递增")
    pack=db.get(CoursePack,pack_id)
    if not pack:raise HTTPException(404,"课程包不存在")
    for kid in item.knowledge_ids:
        if not db.get(KnowledgeNode,(pack_id,kid)):
            raise HTTPException(422,"引用的知识节点不在当前课程包内："+kid)
    old=db.get(Problem,(pack_id,item.id))
    before=problem_document(db,old) if old else None
    if not old:
        old=Problem(coursepack_id=pack_id,problem_id=item.id)
        db.add(old)
    old.type=item.type;old.provenance=item.provenance;old.statement=item.statement
    old.answer_type=item.answer_type;old.solution_paths=item.solution_paths
    old.common_mistakes=item.common_mistakes
    old.rights={**item.rights.model_dump(),"allowed_for_runtime":True,"allowed_for_training":False}
    old.review={**item.review,"status":"approved","reviewer":reviewer,
                "review_note":note,"reviewed_at":datetime.now(UTC).isoformat()}
    db.flush()
    db.query(ProblemKnowledge).filter_by(coursepack_id=pack_id,problem_id=item.id).delete()
    for kid in dict.fromkeys(item.knowledge_ids):
        db.add(ProblemKnowledge(coursepack_id=pack_id,problem_id=item.id,knowledge_id=kid))
    db.query(ProblemHint).filter_by(coursepack_id=pack_id,problem_id=item.id).delete()
    for h in item.hint_ladder:
        db.add(ProblemHint(coursepack_id=pack_id,problem_id=item.id,level=h.level,hint_type=h.type,content=h.content))
    db.flush()
    row=revision(db,reviewer,pack_id,{"problem_id":item.id,"before":before,
                 "after":problem_document(db,old)},"published")
    db.commit()
    return row
