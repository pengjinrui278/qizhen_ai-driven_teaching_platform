from mirror_api.ai_textbook_compile import compile_candidates


def record(page, blocks, kind="content"):
    return {"pdf_page":page,"status":"candidate","page":{"page_kind":kind,"printed_page":str(page-10),"blocks":blocks}}


def block(kind,text,number=None,previous=False,following=False):
    return {"kind":kind,"text":text,"number":number,"continues_from_previous":previous,"continues_to_next":following}


def test_excludes_toc_and_merges_explicit_cross_page_question():
    rows=[record(1,[block("exercise","习题一", "习题一")],"toc"),
          record(11,[block("heading","第一章 测试"),block("heading","第一节 概念"),
                     block("exercise","合成题目上半段","1",following=True)]),
          record(12,[block("exercise","合成题目下半段",previous=True)])]
    data=compile_candidates(rows,{11:"match",12:"issues"})
    assert len(data["units"])==1
    unit=data["units"][0]
    assert unit["chapter"]=="第一章 测试" and unit["section"]=="第一节 概念"
    assert len(unit["fragments"])==2 and unit["flags"]==[]
    assert unit["machine_audit"]==["match","issues"]
    assert not unit["allowed_for_rag"]


def test_never_guesses_missing_pages_or_numbers():
    rows=[record(10,[block("heading","第一章 测试"),block("example","开始","例1",following=True)]),
          record(12,[block("example","另一个片段",previous=True)])]
    units=compile_candidates(rows)["units"]
    assert len(units)==2
    assert "unresolved_next_page" in units[0]["flags"]
    assert "unresolved_previous_page" in units[1]["flags"]
    assert "missing_number" in units[1]["flags"]


def test_separate_chapter_heading_retains_correct_ownership():
    row=record(35,[block("exercise","合成问题","1")])
    row["page"]["headings"]=["第二章 问题求解"]
    result=compile_candidates([row])
    assert result["units"][0]["chapter"]=="第二章 问题求解"
