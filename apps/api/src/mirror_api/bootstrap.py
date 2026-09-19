"""首次本地启动的非覆盖初始化：已有课程包和人工编辑版本保持原样。"""
import json
from sqlalchemy import select
from .config import get_settings
from .db import init_db, make_engine, make_session_factory
from .models import CoursePack
from .seed import seed_profiles
from .coursepack import import_coursepack


def bootstrap():
    settings=get_settings()
    engine=make_engine(settings.database_url)
    init_db(engine)
    with make_session_factory(engine)() as db:
        seed_profiles(db)
        existing=set(db.execute(select(CoursePack.coursepack_id)).scalars())
        for path in settings.coursepack_root.glob("*/*/coursepack.json"):
            manifest=json.loads(path.read_text(encoding="utf-8"))
            if manifest["coursepack_id"] not in existing:
                import_coursepack(db,path.parent)
    engine.dispose()
    print("初始化完成；已有课程包未覆盖，模型配置和密钥不输出。")


if __name__=="__main__":
    bootstrap()
