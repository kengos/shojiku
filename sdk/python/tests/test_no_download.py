"""The no-download invariant.

An SDK that fetches an executable is a supply-chain surface this product does
not take on. The claim is worth a test rather than a sentence in a README,
because it is the kind of thing a convenience commit adds.
"""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1]
SOURCES = sorted((PACKAGE / "src" / "shojiku").glob("*.py"))

NETWORKING = re.compile(
    r"^\s*(?:import|from)\s+"
    r"(socket|ssl|urllib|http|httplib|ftplib|smtplib|telnetlib|asyncio|"
    r"requests|httpx|aiohttp|urllib3)\b",
    re.MULTILINE,
)


def test_reads_every_source_file_so_the_sweep_below_cannot_pass_by_matching_nothing() -> None:
    # The positive control. A sweep whose input is empty reports no offenders
    # and proves nothing at all.
    assert len(SOURCES) >= 12


def test_requires_no_networking_library_anywhere_in_the_package() -> None:
    offenders = [
        path.name for path in SOURCES if NETWORKING.search(path.read_text(encoding="utf-8"))
    ]

    assert offenders == []


def test_the_sweep_actually_matches_a_networking_import_when_there_is_one() -> None:
    # The other half of the control: a regex that matched nothing because it is
    # broken would pass the test above just as well as a clean package does.
    assert NETWORKING.search("import socket\n")
    assert NETWORKING.search("from urllib.request import urlopen\n")


def test_declares_zero_runtime_dependencies() -> None:
    # ctypes is the standard library, so this package needs nothing at all —
    # the ruby reference's equivalent bar is its single `fiddle` entry.
    manifest = tomllib.loads((PACKAGE / "pyproject.toml").read_text(encoding="utf-8"))

    assert manifest["project"]["dependencies"] == []
