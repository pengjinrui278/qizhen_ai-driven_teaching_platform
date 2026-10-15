"""个人导出/删除与过期策略。冻结报告只保留群体数字；不保留私人对话。"""
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from .auth import remove_sessions
from .memory import memory_view, rebuild
from .models import LearningEvidenceRow, MirrorEvent
from .platform_models import Account, Attempt, Audit, CourseRevision, Hypothesis, Observation, SandboxMember, Submission


def export_account(db, user):
    from .ai_learning import AISession, AIMessage, AINote, public
    from .note_library import Note, NoteAttachment, public_note, public_attachment
    # 必须起别名：ai_learning 也导出了 public，同名会把上面那个覆盖掉
    from .chat_upload import ChatUpload, public as public_upload
    attempts=db.execute(select(Attempt).where(Attempt.account_id==user.id)).scalars().all()
    events=db.execute(select(MirrorEvent).where(MirrorEvent.participant_code==user.id)).scalars().all()
    return {"format":"mathmirror-personal-v1","exported_at":datetime.now(UTC).isoformat(),
            "account":{"username":user.username,"nickname":user.nickname,"status":user.status},
            "ai_learning":{model.__tablename__:[public(r) for r in db.scalars(select(model).where(model.account_id==user.id)).all()] for model in (AISession,AIMessage,AINote)},
            "notes":[public_note(r) for r in db.scalars(select(Note).where(Note.account_id==user.id)).all()],
            "note_attachments":[public_attachment(r) for r in db.scalars(select(NoteAttachment).where(NoteAttachment.account_id==user.id)).all()],
            "chat_uploads":[public_upload(r) for r in db.scalars(select(ChatUpload).where(ChatUpload.account_id==user.id)).all()],
            "memory":memory_view(db,user.id),
            "attempts":[{"id":a.id,"course_id":a.course_id,"problem":a.problem} for a in attempts],
            "interactions":[{"request":e.request_payload,"response":e.response_json,
                             "at":e.occurred_at.isoformat()} for e in events],
            "submissions":[{"id":s.id,"text":s.text,"source":s.source,"review":s.review}
                           for s in db.execute(select(Submission).where(Submission.account_id==user.id)).scalars()]}


def delete_personal(db, user):
    from .ai_learning import AISession, AIMessage, AINote
    from .note_library import Note, NoteAttachment, _attachment_path
    from .chat_upload import purge_uploads
    for model in (AIMessage,AINote,AISession):
        db.query(model).filter_by(account_id=user.id).delete(synchronize_session=False)
    for att in db.execute(select(NoteAttachment).where(NoteAttachment.account_id==user.id)).scalars().all():
        path=_attachment_path(att.storage_key)
        if path:
            try: path.unlink()
            except OSError: pass
    for model in (NoteAttachment,Note):
        db.query(model).filter_by(account_id=user.id).delete(synchronize_session=False)
    purge_uploads(db,user.id)
    submission_ids=set(db.execute(select(Submission.id).where(Submission.account_id==user.id)).scalars())
    for row in db.execute(select(Audit)).scalars():
        if row.detail.get("submission_id") in submission_ids:
            row.detail={"personal_data_deleted":True}
    for row in db.execute(select(CourseRevision).where(CourseRevision.actor_id==user.id)).scalars():
        row.actor_id="deleted-account"
    ids=[x for x in db.execute(select(MirrorEvent.request_id).where(
        MirrorEvent.participant_code==user.id)).scalars()]
    if ids:
        db.query(LearningEvidenceRow).filter(LearningEvidenceRow.request_id.in_(ids)).delete(synchronize_session=False)
        db.query(MirrorEvent).filter(MirrorEvent.request_id.in_(ids)).delete(synchronize_session=False)
    for model in (Observation,Hypothesis,Attempt,Submission,SandboxMember):
        db.query(model).filter_by(account_id=user.id).delete(synchronize_session=False)
    # 个人观察纠正审计不保留可回溯身份，教师行政审计只保留无名标识。
    for audit in db.execute(select(Audit).where(Audit.actor_id==user.id)).scalars():
        if audit.action in ("observation_correction", "feedback_source", "course_activity"):
            db.delete(audit)
        else:
            audit.actor_id="deleted-account"
    remove_sessions(db,user.id)
    user.username="deleted-"+user.id
    user.nickname="已删除"
    user.password_hash="deleted:deleted"
    user.status="deleted"
    db.commit()


def expire_personal(db, now=None):
    from .ai_learning import AISession, AIMessage, AINote
    from .note_library import Note, TRASH_RETENTION_DAYS, purge_note
    from .chat_upload import ChatUpload, _upload_path, purge_uploads
    now=now or datetime.now(UTC)
    for user in db.execute(select(Account).where(Account.status!="deleted")).scalars():
        cutoff=now-timedelta(days=user.retention_days)
        # 上传的文档随账号保留期过期（与 AI 对话内容同一口径）：连磁盘原件一起清
        old_uploads=[r.id for r in db.execute(select(ChatUpload).where(
            ChatUpload.account_id==user.id, ChatUpload.created_at<cutoff)).scalars().all()]
        if old_uploads:
            for stale in db.execute(select(ChatUpload).where(ChatUpload.id.in_(old_uploads))).scalars().all():
                path=_upload_path(stale.storage_key)
                if path:
                    try: path.unlink()
                    except OSError: pass
                db.delete(stale)
        # 回收站里的笔记满 30 天彻底清理（连磁盘附件）。
        # 未删除的笔记不随账号保留期过期：学生笔记是长期复习资料，
        # 静默过期等于销毁个人成果；是否纳入账号保留期需产品明确后再改。
        for row in db.execute(select(Note).where(
                Note.account_id==user.id, Note.deleted_at.is_not(None),
                Note.deleted_at<now-timedelta(days=TRASH_RETENTION_DAYS))).scalars().all():
            purge_note(db,row)
        db.query(Audit).filter(Audit.actor_id==user.id,Audit.action=="course_activity",Audit.created_at<cutoff).delete(synchronize_session=False)
        for model in (AIMessage,AINote):
            db.query(model).filter(model.account_id==user.id,model.created_at<cutoff).delete(synchronize_session=False)
        # Keep an old conversation only while it still has retained messages.
        active_ids=select(AIMessage.session_id).where(AIMessage.account_id==user.id)
        db.query(AISession).filter(AISession.account_id==user.id,AISession.created_at<cutoff,
                                  ~AISession.id.in_(active_ids)).delete(synchronize_session=False)
        observations=db.execute(select(Observation).where(
            Observation.account_id==user.id,Observation.created_at<cutoff)).scalars().all()
        courses={r.course_id for r in observations}
        observation_ids = [row.id for row in observations]
        if observation_ids:
            db.query(Audit).filter(Audit.actor_id == user.id,
                Audit.target.in_(observation_ids),
                Audit.action.in_(("observation_correction", "feedback_source"))).delete(
                    synchronize_session=False)
        for row in observations:db.delete(row)
        ids=list(db.execute(select(MirrorEvent.request_id).where(
            MirrorEvent.participant_code==user.id,MirrorEvent.occurred_at<cutoff)).scalars())
        if ids:
            db.query(LearningEvidenceRow).filter(LearningEvidenceRow.request_id.in_(ids)).delete(synchronize_session=False)
            db.query(MirrorEvent).filter(MirrorEvent.request_id.in_(ids)).delete(synchronize_session=False)
        db.query(Attempt).filter(Attempt.account_id==user.id,Attempt.created_at<cutoff).delete(synchronize_session=False)
        db.flush()
        for course in courses:rebuild(db,user.id,course)
    db.commit()
