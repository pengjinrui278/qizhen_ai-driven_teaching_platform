import importlib.util
from mirror_api.config import REPO_ROOT

spec=importlib.util.spec_from_file_location('compile_library',REPO_ROOT/'scripts/compile-textbook-library.py')
library=importlib.util.module_from_spec(spec)
spec.loader.exec_module(library)
TOC={'chapters':[{'number':2,'title':'数列极限','sections':[
    {'number':1,'title':'实数集','pdf_page':40},
    {'number':2,'title':'数列极限','pdf_page':47}]}]}

def test_boundary_exercises_keep_previous_section():
    blocks=[{'kind':'exercise','text':'6. 证明…'}, {'kind':'heading','text':'§2 数列极限'}, {'kind':'definition','text':'定义'}]
    result=library.block_sections(TOC,47,blocks)
    assert [s['number'] for s,_ in result]==[1,2,2]
    assert all('requires_review' in flag for _,flag in result)

def test_missing_boundary_anchor_never_guesses_current_section():
    result=library.block_sections(TOC,47,[{'kind':'exercise','text':'6. 证明…'}])
    assert result==[(None,'section_boundary_unresolved')]

def test_repeated_running_heading_requires_review():
    b={'kind':'heading','text':'§2 数列极限'}
    assert all(s is None for s,_ in library.block_sections(TOC,47,[b,b]))

def test_regular_page_uses_toc_interval():
    s,flag=library.block_sections(TOC,48,[{'kind':'explanation','text':'…'}])[0]
    assert s['number']==2 and flag=='toc_page_interval'
