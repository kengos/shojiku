"""Fixtures shared by every test: the real engine library, the repository's own
font and locale packs, and generated key material.

Nothing here is a stub. This SDK's whole job is to be a faithful binding, so a
suite that mocked the boundary would test the mock. What it does avoid is
repeating the setup: one client, one rendered document, one signed document,
each built once per session.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

import pytest

import shojiku

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_TEMPLATES = str(Path(__file__).parent / "fixtures" / "templates")

# Where the bytes-first entrance's bundled assets live. A directory rather than
# a template root: `generate_source` resolves `assets/logo.svg` against it and
# resolves NOTHING else, since there is no name to look up.
SOURCE_ASSETS = str(Path(__file__).parent / "fixtures" / "sources")


@pytest.fixture(autouse=True)
def _reset_configuration() -> Any:
    """`shojiku.configure` is process-wide state.

    An example that sets a default would otherwise decide what an unrelated one
    resolves to — the failure appearing in whichever test happened to run next.
    """
    yield
    shojiku.reset_configuration()


@pytest.fixture(scope="session")
def keys(tmp_path_factory: pytest.TempPathFactory) -> str:
    """Generated, never committed.

    A repository checkout holds no private key, and a leaked test key is worth
    nothing. The same generator the Rust suites use, so both sides sign with the
    same shapes. Session-scoped so the GENERATOR runs once — a generator that is
    merely idempotent is still unsafe to run beside itself, because it writes its
    completion sentinel last.
    """
    directory = tmp_path_factory.mktemp("keys")
    subprocess.run(
        ["sh", str(REPO_ROOT / "scripts" / "gen-test-keys.sh"), str(directory)],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    return str(directory)


@pytest.fixture(scope="session")
def engine_library() -> str:
    """The library path, read once from the environment the image sets.

    Passed explicitly because every client below runs with `env=False`.
    """
    return os.environ["SHOJIKU_LIBRARY"]


@pytest.fixture
def font_dirs() -> list[str]:
    return [str(REPO_ROOT / "packs" / "fonts")]


@pytest.fixture
def locale_dirs() -> list[str]:
    return [str(REPO_ROOT / "packs" / "locale")]


@pytest.fixture
def make_client(engine_library: str, font_dirs: list[str], locale_dirs: list[str]) -> Any:
    """A client over the fixture template root, with the packs wired up.

    The environment is deliberately OFF — a test that accidentally inherited a
    `SHOJIKU_*` variable from the runner would be testing the runner.
    """

    def build(templates: str | None = FIXTURE_TEMPLATES, **overrides: Any) -> shojiku.Client:
        # Overrides WIN, rather than colliding with the defaults: a test that
        # passes `locale_dirs=[]` is deliberately taking the packs away.
        settings: dict[str, Any] = {
            "templates": templates,
            "font_dirs": font_dirs,
            "locale_dirs": locale_dirs,
            "library": engine_library,
            "env": False,
        }
        settings.update(overrides)
        return shojiku.Client(**settings)

    return build


@pytest.fixture
def client(make_client: Any) -> shojiku.Client:
    return make_client()


@pytest.fixture
def rendered(client: shojiku.Client) -> shojiku.DocumentArtifact:
    result = client.generate("receipt", {"customer": {"name": "Yamada Shoji K.K."}})
    if result.failed:
        pytest.fail(f"the fixture template did not render: {result.failure}")
    return result.unwrap()


@pytest.fixture
def signer(keys: str) -> shojiku.LocalPem:
    return shojiku.LocalPem(key=f"{keys}/rsa2048.key.pem", cert=f"{keys}/rsa2048.cert.pem")


@pytest.fixture
def signed(
    rendered: shojiku.DocumentArtifact, signer: shojiku.LocalPem
) -> shojiku.DocumentArtifact:
    result = rendered.sign(signer)
    if result.failed:
        pytest.fail(f"the fixture document did not sign: {result.failure}")
    return result.unwrap()


def source_template(items: str, **overrides: str) -> str:
    """A template as SOURCE TEXT, for the entrance that never reads a file.

    `items` is spliced in already indented to the flow's item list.
    """
    style = overrides.get("style", "{ fontFamily: noto-sans, fontSize: 10.5 }")
    indented = "\n".join(f"      {line}" for line in items.rstrip("\n").split("\n"))
    return (
        "version: 0.1.0\n"
        "name: inline\n"
        "page: { size: A4, margin: 25 }\n"
        "defaults:\n"
        f"  locale: {overrides.get('locale', 'en-US')}\n"
        f"  style: {style}\n"
        "sections:\n"
        "  body:\n"
        "    type: flow\n"
        "    items:\n"
        f"{indented}\n"
    )


def text_item(key: str) -> str:
    """One text item binding `key`.

    Sized from the fixture templates that render warning-free at this font size.
    """
    return (
        "- id: line\n"
        "  type: text\n"
        "  box: { x: 0, y: 0, w: 400, h: 16 }\n"
        f'  text: "Billed to {{{key}}}"\n'
    )


def read_bytes(path: str) -> bytes:
    return Path(path).read_bytes()
