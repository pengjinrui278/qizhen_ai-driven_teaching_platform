import pytest
from pydantic import ValidationError
from mirror_api.textbook_catalog import TextbookUnit, SourceSpan

def unit(**changes):
    return TextbookUnit(source_sha256="a"*64,book_title="合成教材",edition="测试版",volume="上",
        kind="exercise",original_text="测试题干",source_spans=[SourceSpan(pdf_page=10,printed_page="1"),SourceSpan(pdf_page=11,printed_page="2")],**changes)

def test_drafts_cannot_be_used_as_verified_sources():
    with pytest.raises(ValueError):
        unit().citation()

def test_verified_exercise_requires_number():
    with pytest.raises(ValidationError):
        unit(status="verified",chapter="第一章",section="第一节",formula_checked=True,
             location_checked=True,completeness_checked=True,reviewer="test",reviewed_at="2026-09-08")

def test_cross_page_exercise_has_exact_citation():
    row=unit(status="verified",chapter="第一章",section="第一节",number="3(2)",formula_checked=True,
             location_checked=True,completeness_checked=True,reviewer="test",reviewed_at="2026-09-08")
    assert "第3(2)题" in row.citation()
    assert "第1、2页" in row.citation()

def test_uncertain_formula_blocks_publication():
    with pytest.raises(ValidationError):
        unit(status="verified",unresolved=["上下标不清"],number="3",chapter="一",section="二",
             formula_checked=True,location_checked=True,completeness_checked=True,reviewer="test",reviewed_at="2026-09-08")

@pytest.mark.parametrize("bbox",[(0,0,2,1),(.5,0,.2,1),(0,1,1,0)])
def test_invalid_source_rectangles(bbox):
    with pytest.raises(ValidationError):
        SourceSpan(pdf_page=1,bbox=bbox)
