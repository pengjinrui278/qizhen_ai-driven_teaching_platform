import copy,hashlib,importlib.util,json
import pytest
from mirror_api.config import REPO_ROOT

spec=importlib.util.spec_from_file_location('assemble_library',REPO_ROOT/'scripts/assemble-textbook-units.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def fixture():
    sha='a'*64
    def row(i,page,block):return {'id':sha+':'+i,'source_sha256':sha,'part':'body','book_title':'数学分析','edition':'第三版','volume':'上册','chapter':{'number':2},'section':{'number':3},'original_text':i,'source_spans':[{'pdf_page':page,'block_index':block,'printed_page':str(page-19)}]}
    rows={sha+':62:14':row('62:14',62,14),sha+':63:0':row('63:0',63,0)}
    spec={'kind':'exercise','number':'2','chapter':2,'section':3,'members':[{'id':'62:14','role':'question'},{'id':'63:0','role':'question'}],
          'content_sha256':hashlib.sha256(json.dumps(['62:14','63:0'],ensure_ascii=False).encode()).hexdigest()}
    return rows,spec,sha

def test_cross_page_keeps_both_spans_and_stays_unpublished():
    r=module.assemble(*fixture())
    assert len(r['parts'])==2 and len(r['source_spans'])==2
    assert not r['eligible_for_exercise_bank'] and not r['eligible_for_answers']

def test_changed_content_invalidates_review():
    rows,spec,sha=fixture();rows[sha+':63:0']['original_text']='changed'
    with pytest.raises(ValueError,match='content changed'):module.assemble(rows,spec,sha)

def test_same_number_in_different_section_cannot_merge():
    rows,spec,sha=fixture();rows[sha+':63:0']['section']['number']=4
    with pytest.raises(ValueError,match='Cross-section'):module.assemble(rows,spec,sha)

def test_duplicate_fragment_cannot_inflate_unit():
    rows,spec,sha=fixture();spec['members'].append(copy.deepcopy(spec['members'][0]))
    with pytest.raises(ValueError,match='Repeated'):module.assemble(rows,spec,sha)

def test_answer_only_cannot_be_an_original_question():
    rows,spec,sha=fixture()
    for m in spec['members']:m['role']='solution'
    with pytest.raises(ValueError,match='Missing question'):module.assemble(rows,spec,sha)
