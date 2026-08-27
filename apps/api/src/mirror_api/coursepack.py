"""CoursePack 导入管道。

把 ``coursepacks/<course>/<profile>/`` 目录（manifest + jsonl）校验后写入
数据库。约束：

- 每一行都必须通过 schema 校验，错误按行号汇报；
- 题目引用的知识节点必须在同一个包内存在（引用完整性 = 可追溯性）；
- 来源/授权字段原样保存，运行时与检索环节负责门控；
- 重复导入同一 ``coursepack_id`` 时替换内容（当前版本覆盖），
  发布/回滚的版本链在阶段 3 课程端实现。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from .models import CoursePack, KnowledgeNode, Problem, ProblemHint, ProblemKnowledge


class CoursePackImportError(ValueError):
    pass


class CoursePackManifest(BaseModel):
    coursepack_id: str
    status: str
    course_id: str
    profile_id: str
    textbook: dict = Field(default_factory=dict)
    content_policy: str = ""
    knowledge_file: str = "knowledge.jsonl"
    problems_file: str = "problems.jsonl"


class KnowledgeSource(BaseModel):
    kind: str
    allowed_for_rag: bool = False
    allowed_for_eval: bool = False
    allowed_for_training: bool = False


class KnowledgeItem(BaseModel):
    model_config = {"extra": "allow"}

    id: str
    type: str
    title: str
    statement: str
    prerequisites: list[str] = Field(default_factory=list)
    relations: list[dict] = Field(default_factory=list)
    conditions: list[str] = Field(default_factory=list)
    conclusion: str | None = None
    common_misuses: list[str] = Field(default_factory=list)
    source: KnowledgeSource
    review: dict = Field(default_factory=dict)


class ProblemRights(BaseModel):
    allowed_for_runtime: bool = False
    allowed_for_rag: bool = False
    allowed_for_eval: bool = False
    allowed_for_training: bool = False


class HintStep(BaseModel):
    level: int = Field(ge=1, le=7)
    type: str
    content: str


class ProblemItem(BaseModel):
    model_config = {"extra": "allow"}

    id: str
    type: str
    provenance: str
    statement: str
    answer_type: str
    knowledge_ids: list[str] = Field(default_factory=list)
    solution_paths: list[dict] = Field(default_factory=list)
    hint_ladder: list[HintStep] = Field(default_factory=list)
    common_mistakes: list[str] = Field(default_factory=list)
    rights: ProblemRights
    review: dict = Field(default_factory=dict)


@dataclass
class ImportReport:
    coursepack_id: str
    knowledge_count: int = 0
    problem_count: int = 0
    hint_count: int = 0
    warnings: list[str] = field(default_factory=list)


def _read_jsonl(path: Path) -> list[tuple[int, dict]]:
    rows: list[tuple[int, dict]] = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append((lineno, json.loads(line)))
        except json.JSONDecodeError as exc:
            raise CoursePackImportError(f"{path.name} 第 {lineno} 行不是合法 JSON：{exc}")
    return rows


def _validate_rows(rows: list[tuple[int, dict]], model: type[BaseModel], label: str) -> list:
    items, errors = [], []
    for lineno, raw in rows:
        try:
            items.append(model.model_validate(raw))
        except ValidationError as exc:
            errors.append(f"{label} 第 {lineno} 行：{exc.errors()[:3]}")
    if errors:
        raise CoursePackImportError("；".join(errors))
    return items


def import_coursepack(session: Session, pack_dir: Path) -> ImportReport:
    pack_dir = Path(pack_dir)
    manifest_path = pack_dir / "coursepack.json"
    if not manifest_path.exists():
        raise CoursePackImportError(f"缺少 coursepack.json：{pack_dir}")

    try:
        manifest = CoursePackManifest.model_validate_json(manifest_path.read_text(encoding="utf-8"))
    except ValidationError as exc:
        raise CoursePackImportError(f"coursepack.json 不合法：{exc.errors()[:3]}")

    knowledge_rows = _read_jsonl(pack_dir / manifest.knowledge_file)
    problem_rows = _read_jsonl(pack_dir / manifest.problems_file)
    knowledge_items = _validate_rows(knowledge_rows, KnowledgeItem, manifest.knowledge_file)
    problem_items = _validate_rows(problem_rows, ProblemItem, manifest.problems_file)

    knowledge_ids = {item.id for item in knowledge_items}
    broken = sorted(
        {
            kid
            for problem in problem_items
            for kid in problem.knowledge_ids
            if kid not in knowledge_ids
        }
    )
    if broken:
        raise CoursePackImportError(f"题目引用了包内不存在的知识节点：{broken}")

    report = ImportReport(coursepack_id=manifest.coursepack_id)

    # 幂等：同一 coursepack_id 覆盖导入。按子表→父表顺序执行即时批量删除，
    # 避免 ORM 在无关系对象时不保证删除顺序导致外键违例。
    existing = session.get(CoursePack, manifest.coursepack_id)
    if existing is not None:
        session.query(ProblemHint).filter_by(coursepack_id=manifest.coursepack_id).delete()
        session.query(ProblemKnowledge).filter_by(coursepack_id=manifest.coursepack_id).delete()
        session.query(Problem).filter_by(coursepack_id=manifest.coursepack_id).delete()
        session.query(KnowledgeNode).filter_by(coursepack_id=manifest.coursepack_id).delete()
        session.query(CoursePack).filter_by(coursepack_id=manifest.coursepack_id).delete()
        session.flush()
        report.warnings.append(f"{manifest.coursepack_id} 已存在，本次为覆盖导入")

    session.add(
        CoursePack(
            coursepack_id=manifest.coursepack_id,
            course_id=manifest.course_id,
            profile_id=manifest.profile_id,
            status=manifest.status,
            textbook=manifest.textbook,
            content_policy=manifest.content_policy,
        )
    )
    # ORM 没有关系对象时不保证 flush 顺序：父表先落库，避免外键违例
    session.flush()

    for item in knowledge_items:
        session.add(
            KnowledgeNode(
                coursepack_id=manifest.coursepack_id,
                knowledge_id=item.id,
                type=item.type,
                title=item.title,
                statement=item.statement,
                prerequisites=item.prerequisites,
                relations=item.relations,
                conditions=item.conditions,
                conclusion=item.conclusion,
                common_misuses=item.common_misuses,
                source=item.source.model_dump(),
                review=item.review,
            )
        )
        report.knowledge_count += 1

    for problem in problem_items:
        session.add(
            Problem(
                coursepack_id=manifest.coursepack_id,
                problem_id=problem.id,
                type=problem.type,
                provenance=problem.provenance,
                statement=problem.statement,
                answer_type=problem.answer_type,
                solution_paths=problem.solution_paths,
                common_mistakes=problem.common_mistakes,
                rights=problem.rights.model_dump(),
                review=problem.review,
            )
        )
        report.problem_count += 1
    session.flush()

    for problem in problem_items:
        for step in problem.hint_ladder:
            session.add(
                ProblemHint(
                    coursepack_id=manifest.coursepack_id,
                    problem_id=problem.id,
                    level=step.level,
                    hint_type=step.type,
                    content=step.content,
                )
            )
            report.hint_count += 1

        for kid in problem.knowledge_ids:
            session.add(
                ProblemKnowledge(
                    coursepack_id=manifest.coursepack_id,
                    problem_id=problem.id,
                    knowledge_id=kid,
                )
            )

    session.commit()
    return report
