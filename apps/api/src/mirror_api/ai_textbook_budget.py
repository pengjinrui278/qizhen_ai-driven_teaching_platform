"""Dedicated immutable 20 CNY cap for the approved AI textbook, peak-rate accounting."""
import sqlite3
from pathlib import Path


class AIBudget:
    LIMIT = 20_000_000
    INPUT = 2
    OUTPUT = 8

    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS policy (id INTEGER PRIMARY KEY, cap INTEGER, input_rate INTEGER, output_rate INTEGER)")
            db.execute("INSERT OR IGNORE INTO policy VALUES (1,?,?,?)", (self.LIMIT,self.INPUT,self.OUTPUT))
            if db.execute("SELECT cap,input_rate,output_rate FROM policy WHERE id=1").fetchone() != (self.LIMIT,self.INPUT,self.OUTPUT):
                raise ValueError("Budget policy mismatch; no automatic increase")
            db.execute("CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY,reserved INTEGER NOT NULL,cost INTEGER,status TEXT NOT NULL,input_tokens INTEGER,output_tokens INTEGER)")

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def reserve(self, key, amount):
        if amount <= 0:
            raise ValueError("Invalid reservation")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM calls WHERE id=?", (key,)).fetchone():
                return False
            used = db.execute("SELECT COALESCE(SUM(COALESCE(cost,reserved)),0) FROM calls").fetchone()[0]
            if used+amount > self.LIMIT:
                raise ValueError("Authorized 20 CNY cap reached")
            db.execute("INSERT INTO calls(id,reserved,status) VALUES (?,?,'reserved')", (key,amount))
        return True

    def settle(self, key, usage, status):
        p,o = usage.get("prompt_tokens"),usage.get("completion_tokens")
        valid = type(p) is int and type(o) is int and p>=0 and o>=0
        cost = p*self.INPUT+o*self.OUTPUT if valid else None
        with self.connect() as db:
            reserved=db.execute("SELECT reserved FROM calls WHERE id=?", (key,)).fetchone()
            if not reserved:
                raise ValueError("Unreserved call")
            db.execute("UPDATE calls SET cost=?,status=?,input_tokens=?,output_tokens=? WHERE id=?",
                       (cost,status,p if valid else None,o if valid else None,key))
        if valid and cost>reserved[0]:
            raise ValueError("Reservation exceeded; stop and audit")

    def summary(self):
        with self.connect() as db:
            count,total,unknown=db.execute("SELECT COUNT(*),COALESCE(SUM(COALESCE(cost,reserved)),0),COALESCE(SUM(cost IS NULL),0) FROM calls").fetchone()
        return {"calls":count,"conservative_cny":round(total/1_000_000,6),"unknown":unknown,
                "limit_cny":20,"pricing":"peak input 2/output 8 CNY per million; cache discounts ignored"}
