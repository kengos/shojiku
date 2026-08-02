"""Builds the demo SQLite database the recipe renders from — the stand-in
for your application's real database. One receipt header, three lines."""

import sqlite3

con = sqlite3.connect("params.db")
con.executescript(
    """
    create table receipt (
      number text, issued_at text, recipient text, purpose text
    );
    create table line (
      name text, quantity integer, unit_price integer
    );
    insert into receipt values
      ('R-2026-0802-001', '2026-08-02T10:00:00+09:00', '株式会社正直堂', '事務用品代');
    insert into line values
      ('コピー用紙 A4 500枚', 4, 550),
      ('インクカートリッジ 4色セット', 1, 4800),
      ('送料', 1, 800);
    """
)
con.commit()
