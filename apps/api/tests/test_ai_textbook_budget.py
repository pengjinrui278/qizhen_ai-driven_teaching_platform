from concurrent.futures import ThreadPoolExecutor
import pytest
from mirror_api.ai_textbook_budget import AIBudget


def test_atomic_twenty_yuan_cap(tmp_path):
    budget=AIBudget(tmp_path/"budget.sqlite")
    def reserve(i):
        try:
            return budget.reserve(str(i),1_000_000)
        except ValueError:
            return False
    with ThreadPoolExecutor(max_workers=6) as workers:
        assert sum(workers.map(reserve,range(30)))==20
    assert budget.summary()["conservative_cny"]==20
    assert budget.summary()["unknown"]==20


def test_unknown_usage_reservation_and_peak_rates(tmp_path):
    budget=AIBudget(tmp_path/"budget.sqlite")
    assert budget.reserve("page1",100_000)
    assert not budget.reserve("page1",100_000)
    budget.settle("page1",{},"timeout")
    assert budget.summary()["conservative_cny"]==0.1
    assert budget.reserve("page2",100_000)
    budget.settle("page2",{"prompt_tokens":1000,"completion_tokens":1000},"candidate")
    assert budget.summary()["conservative_cny"]==0.11
    with pytest.raises(ValueError):
        budget.settle("not-reserved",{},"failed")
    with budget.connect() as db:
        db.execute("UPDATE policy SET cap=21000000")
    with pytest.raises(ValueError):
        AIBudget(tmp_path/"budget.sqlite")
