"""What verification found — INCLUDING what it did not look at.

``not_checked`` is a field, not a footnote, and this binding passes it through
untouched. A "valid" verdict that quietly skipped revocation is worse than no
verifier at all: it turns a missing capability into a false assurance, which is
exactly the trust a signing feature sells. Dropping it on the way through an SDK
would be the same lie one layer up.

The four checks stay separate for the same reason. "The signature is valid but
covers only part of the file" is a different fact from "the signature is wrong",
and a caller that cannot tell them apart cannot explain the answer to anyone.
"""

from __future__ import annotations

import json
from typing import Any


class Check:
    """The outcome of one check: passed, or failed with the reason."""

    def __init__(self, item: dict[str, Any] | None) -> None:
        payload = item or {}
        self.status: str | None = payload.get("status")
        self.reason: str | None = payload.get("reason")

    @property
    def passed(self) -> bool:
        return self.status == "passed"

    def __str__(self) -> str:
        return f"{self.status}: {self.reason}" if self.reason else str(self.status)


class VerificationReport:
    """The four checks, the verdict, and the list of what was never looked at."""

    def __init__(self, payload: dict[str, Any]) -> None:
        self._valid = payload.get("valid")
        self.signature = Check(payload.get("signature"))
        self.coverage = Check(payload.get("coverage"))
        self.certificate_validity = Check(payload.get("certificateValidity"))
        self.trust_chain = Check(payload.get("trustChain"))
        self.not_checked: tuple[str, ...] = tuple(payload.get("notChecked") or ())

    @staticmethod
    def parse(payload: str) -> VerificationReport:
        return VerificationReport(json.loads(payload))

    @property
    def valid(self) -> bool:
        """Whether every check this release PERFORMS passed.

        Read ``not_checked`` beside it: this is not "the document is
        trustworthy", it is "nothing we looked at was wrong".
        """
        return self._valid is True

    @property
    def checks(self) -> dict[str, Check]:
        return {
            "signature": self.signature,
            "coverage": self.coverage,
            "certificate_validity": self.certificate_validity,
            "trust_chain": self.trust_chain,
        }
