from concurrent.futures import ThreadPoolExecutor
import pytest
from mirror_api.textbook_budget import Budget

def test_reservation_survives_restart_and_is_idempotent(tmp_path):
    path=tmp_path/"ledger.sqlite"
    first=Budget(path)
    assert first.reserve("page1")
    second=Budget(path)
    assert not second.reserve("page1")
    assert second.summary()["conservative_cny"]==.1

def test_unknown_charge_is_not_refunded(tmp_path):
    budget=Budget(tmp_path/"ledger.sqlite")
    budget.reserve("page1")
    budget.settle("page1",{},"timeout")
    assert budget.summary()["conservative_cny"]==.1

def test_peak_rate_conservative_accounting(tmp_path):
    budget=Budget(tmp_path/"ledger.sqlite")
    budget.reserve("page1")
    budget.settle("page1",{"prompt_tokens":2000,"completion_tokens":3000},"ok")
    assert budget.summary()["conservative_cny"]==.033

def test_concurrent_reservations_cannot_exceed_cap(tmp_path):
    budget=Budget(tmp_path/"ledger.sqlite",limit=200_000)
    def reserve(i):
        try:return budget.reserve(str(i))
        except ValueError:return False
    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(reserve,range(12)))==2
    assert budget.summary()["conservative_cny"]==.2

def test_existing_limit_cannot_be_increased(tmp_path):
    path=tmp_path/"ledger.sqlite"
    Budget(path,limit=200_000)
    with pytest.raises(ValueError):Budget(path,limit=300_000)
