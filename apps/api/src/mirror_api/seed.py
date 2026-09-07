"""把 ``profiles/*.json`` 课程注册表写入数据库（幂等）。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from .models import Course, CourseProfileRow
from .registry import load_course_profiles


def seed_profiles(session: Session) -> int:
    profiles = load_course_profiles()
    for profile in profiles.values():
        course = session.get(Course, profile.course_id)
        if course is None:
            session.add(
                Course(
                    course_id=profile.course_id,
                    display_name=profile.display_name,
                    mirror_name=profile.mirror_name,
                    stage=profile.stage,
                )
            )
        payload = {
            "knowledge_forms": profile.knowledge_forms,
            "capabilities": profile.capabilities,
            "harnesses": profile.harnesses,
            "source_refs": [ref.model_dump() for ref in profile.source_refs],
            "metadata_": profile.metadata,
            "is_current": True,
        }
        row = session.get(CourseProfileRow, (profile.course_id, profile.profile_id))
        if row is None:
            session.add(
                CourseProfileRow(
                    course_id=profile.course_id, profile_id=profile.profile_id, **payload
                )
            )
        else:
            for key, value in payload.items():
                setattr(row, key, value)
    session.commit()
    return len(profiles)
