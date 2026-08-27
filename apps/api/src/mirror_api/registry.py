import json
from functools import lru_cache
from pathlib import Path

from .domain import CourseProfile

PROFILE_DIR = Path(__file__).parent / "profiles"


@lru_cache
def load_course_profiles() -> dict[str, CourseProfile]:
    profiles: dict[str, CourseProfile] = {}
    for path in sorted(PROFILE_DIR.glob("*.json")):
        profile = CourseProfile.model_validate_json(path.read_text(encoding="utf-8"))
        if profile.course_id in profiles:
            raise ValueError(f"Duplicate course_id: {profile.course_id}")
        profiles[profile.course_id] = profile
    return profiles


def public_profile(profile: CourseProfile) -> dict:
    payload = json.loads(profile.model_dump_json())
    return payload

