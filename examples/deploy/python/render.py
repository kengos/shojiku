"""The production shape: static document facts (issuer block, QR) stay in
the vendored base params; the transactional half (header + lines + totals)
comes out of SQLite. Writes the PDF to stdout."""

import json
import sqlite3
import sys

import shojiku

con = sqlite3.connect("params.db")
head = con.execute("select number, issued_at, recipient, purpose from receipt").fetchone()
lines = con.execute("select name, quantity, unit_price from line").fetchall()

params = json.load(open("params-base.json"))
items = [
    {"name": n, "quantity": q, "unit_price": p, "amount": q * p} for (n, q, p) in lines
]
total_ex = sum(i["amount"] for i in items)
tax = total_ex // 10
params.update(
    {
        "receipt": {"number": head[0], "issued_at": head[1]},
        "recipient": {"name": head[2]},
        "purpose": head[3],
        "items": items,
        "amount": {"total_in_tax": total_ex + tax, "total_ex_tax": total_ex, "tax": tax},
    }
)

client = shojiku.Client(
    templates="templates/", font_dirs=["packs/fonts"], locale_dirs=["packs/locale"]
)
result = client.generate("receipt-ja", params)
if not result.success:
    raise SystemExit(f"render failed: {result.failure.kind} | {result.failure.message}")
sys.stdout.buffer.write(result.artifact.bytes)
