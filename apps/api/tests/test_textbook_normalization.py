import importlib.util
from pathlib import Path
from mirror_api.config import REPO_ROOT

spec=importlib.util.spec_from_file_location("normal",REPO_ROOT/"scripts/normalize-textbook-ocr.py")
normal=importlib.util.module_from_spec(spec)
spec.loader.exec_module(normal)

def test_invalid_latex_escape_is_recovered_without_losing_slash():
    assert normal.repair_json(r'{"text":"\(x\) \frac{1}{n} \to 0"}')["text"]==r"\(x\) \frac{1}{n} \to 0"

def test_valid_json_preserves_escaped_math():
    assert normal.repair_json(r'{"text":"\\frac{1}{n}\nsecond line"}')["text"]=="\\frac{1}{n}\nsecond line"

def test_literal_newline_inside_json_string():
    assert normal.repair_json('{"text":"first\nsecond"}')["text"]=="first\nsecond"

def test_accepted_json_control_escape_is_flagged():
    _,flags=normal.normalize({"page":{"blocks":[{"kind":"explanation","text":"\frac{1}{2}","continues_from_previous":False,"continues_to_next":False}]}})
    assert "possible_latex_control_escape" in flags

def test_unescaped_underline_is_preserved_not_invalid_unicode_escape():
    assert normal.repair_json(r'{"text":"\underline{x}"}')["text"]==r"\underline{x}"

def test_terminal_stray_brace_repair_preserves_uncertainty():
    value=normal.repair_json('{"uncertainties":["formula unclear"}]}')
    assert value=={"uncertainties":["formula unclear"]}
