from types import SimpleNamespace
from mirror_api.retrieval import _query_tokens, _rank
from mirror_api.retrieval_terms import concept_query


def rank(query, docs):
    return _rank(docs, query, lambda d: d.title, lambda d: d.content, 5)


def test_variables_and_numbers_do_not_retrieve_arbitrary_pages():
    assert not _query_tokens(r"x n 123 \frac{1}{n}")


def test_specific_concept_beats_generic_overlap_and_duplicates():
    wrong = SimpleNamespace(title="函数极限", content="如何证明函数在一点处的极限存在")
    correct = SimpleNamespace(title="一致收敛", content="一致收敛与逐点收敛的量词顺序不同")
    duplicate = SimpleNamespace(title="重复扫描", content=correct.content)
    found = rank("请问如何证明一致收敛？", [wrong, correct, duplicate])
    assert found == [correct]


def test_cross_language_alias_and_late_ocr_concept():
    doc = SimpleNamespace(title="一致连续", content="定义与例子")
    assert rank("uniform continuity", [doc]) == [doc]
    text = "题目背景与计算" * 100 + "请分析这列函数是否一致收敛"
    assert concept_query(text) == "一致收敛"
