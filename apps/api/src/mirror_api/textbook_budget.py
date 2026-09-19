"""Persistent spending cap. Unknown charges retain a full reservation."""
import sqlite3
from pathlib import Path

class Budget:
    def __init__(self,path,limit=100_000_000):
        self.path=str(path)
        Path(path).parent.mkdir(parents=True,exist_ok=True)
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS budget (id INTEGER PRIMARY KEY CHECK(id=1), limit_micro INTEGER NOT NULL)")
            db.execute("INSERT OR IGNORE INTO budget VALUES (1,?)",(limit,))
            if db.execute("SELECT limit_micro FROM budget").fetchone()[0]!=limit:
                raise ValueError("Existing authorized limit cannot be changed")
            db.execute("CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, reserved INTEGER NOT NULL, cost INTEGER, status TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER)")
    def connect(self):
        return sqlite3.connect(self.path,timeout=30)
    def reserve(self,key,amount=100_000):
        if amount<=0:raise ValueError("Reservation must be positive")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM calls WHERE id=?",(key,)).fetchone():return False
            used=db.execute("SELECT COALESCE(SUM(COALESCE(cost,reserved)),0) FROM calls").fetchone()[0]
            if used+amount>db.execute("SELECT limit_micro FROM budget").fetchone()[0]:
                raise ValueError("Authorized budget exhausted")
            db.execute("INSERT INTO calls(id,reserved,status) VALUES (?,?,'reserved')",(key,amount))
            return True
    def settle(self,key,usage,status):
        p=usage.get("prompt_tokens");o=usage.get("completion_tokens")
        valid=type(p) is int and type(o) is int and p>=0 and o>=0
        cost=p*3+o*9 if valid else None
        with self.connect() as db:
            reservation=db.execute("SELECT reserved FROM calls WHERE id=?",(key,)).fetchone()
            if reservation is None:raise ValueError("Cannot settle an unreserved call")
            db.execute("UPDATE calls SET cost=?,status=?,input_tokens=?,output_tokens=? WHERE id=?",
                       (cost,status,p if valid else None,o if valid else None,key))
        if valid and cost>reservation[0]:raise ValueError("Reservation exceeded; stop and audit")
    def summary(self):
        with self.connect() as db:
            row=db.execute("SELECT COUNT(*),COALESCE(SUM(COALESCE(cost,reserved)),0),SUM(cost IS NULL) FROM calls").fetchone()
            return {"calls":row[0],"conservative_cny":round(row[1]/1_000_000,6),"unsettled_or_unknown":row[2] or 0}
