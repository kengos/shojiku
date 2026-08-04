"""Shojiku for Python — a template plus your data, deterministically, as a PDF.

```python
import shojiku

client = shojiku.Client(templates="app/templates")
result = client.generate("receipt_ja", {"customer": {"name": "Yamada Shoji K.K."}})
if result.success:
    result.artifact.write("receipt.pdf")
```

Three things about this package are worth knowing before reading any of it.

**Results, not exceptions.** No lifecycle operation raises in the normal flow.
What raises is programmer misuse (:class:`UsageError`) and an environment with
no engine in it (:class:`LibraryNotFoundError`).

**Nothing here reimplements the engine.** Layout, formatting and PDF
construction all happen in the shared C library this package loads, so the same
params produce the same bytes here, in the CLI, in the Designer and in the other
six SDKs. A missing capability is missing in the engine and gets added there.

**Nothing here downloads anything**, at install time or at run time. The
platform wheel carries the binary; otherwise you point ``SHOJIKU_LIBRARY`` at one
you built. Sources an application fetched itself go to
:meth:`Client.generate_source` — fetching is the application's act, and a
deployment that wants to forbid even that declares ``strict`` (see
:class:`Lockdown`).
"""

from shojiku.artifact import DocumentArtifact, Origin
from shojiku.client import Client
from shojiku.config import Config, config, configure, reset_configuration
from shojiku.diagnostic import Diagnostic
from shojiku.errors import (
    AbiMismatchError,
    Error,
    LibraryNotFoundError,
    MaterialUnreadableError,
    UnwrapError,
    UsageError,
)
from shojiku.external_signer import Algorithm, ExternalSigner
from shojiku.failure import Failure, Step
from shojiku.local_pem import LocalPem
from shojiku.lockdown import Lockdown
from shojiku.result import Result
from shojiku.verification_report import Check, VerificationReport
from shojiku.version import __version__

__all__ = [
    "AbiMismatchError",
    "Algorithm",
    "Check",
    "Client",
    "Config",
    "Diagnostic",
    "DocumentArtifact",
    "Error",
    "ExternalSigner",
    "Failure",
    "LibraryNotFoundError",
    "LocalPem",
    "Lockdown",
    "MaterialUnreadableError",
    "Origin",
    "Result",
    "Step",
    "UnwrapError",
    "UsageError",
    "VerificationReport",
    "__version__",
    "config",
    "configure",
    "reset_configuration",
]
