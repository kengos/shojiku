"""The FFI boundary: ownership, widths, and the two levels of failure."""

from __future__ import annotations

from typing import Any

import pytest

import shojiku
from conftest import read_bytes, source_template, text_item
from shojiku.request import Request
from shojiku.sources import Sources


@pytest.fixture
def engine(client: shojiku.Client) -> Any:
    return client._engine


def test_frees_the_result_handle_even_when_reading_it_raises(
    engine: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The ownership rule of this binding: no Python object ever holds a pointer
    # into engine memory. Every call copies what it needs while the handle is
    # alive and frees the handle on the way out — including when reading it
    # raises, which is what the `finally` is for and what nothing else proves.
    freed: list[Any] = []
    real_free = engine._free

    def counting_free(handle: Any) -> Any:
        freed.append(handle)
        return real_free(handle)

    def exploding_snapshot(*_: Any, **__: Any) -> None:
        raise RuntimeError("boom")

    monkeypatch.setattr(engine, "_free", counting_free)
    monkeypatch.setattr(engine, "_snapshot", exploding_snapshot)

    with pytest.raises(RuntimeError, match="boom"):
        engine.engine_info()

    assert len(freed) == 1


def test_reads_a_zero_length_buffer_without_dereferencing_the_pointer(
    engine: Any, rendered: shojiku.DocumentArtifact, keys: str
) -> None:
    # `sign` produces a result with no JSON payload at all. An accessor that
    # trusted the lent pointer for an empty buffer would read whatever was in
    # that slot; the length is checked first, so nothing is dereferenced.
    snapshot = engine.sign(
        pdf=rendered.bytes,
        key=read_bytes(f"{keys}/rsa2048.key.pem"),
        certificate=read_bytes(f"{keys}/rsa2048.cert.pem"),
    )

    assert snapshot.json == ""
    assert isinstance(snapshot.json, str)


def test_keeps_binary_as_bytes_and_text_as_str(engine: Any) -> None:
    # Python's failure mode is not a wrong encoding TAG (as it is in Ruby) but
    # decoding binary as text, or leaving text undecoded. A PDF decoded as UTF-8
    # would raise or corrupt; a JSON payload left as bytes would compare unequal
    # to every string a caller writes.
    snapshot = engine.engine_info()

    assert isinstance(snapshot.json, str)
    assert isinstance(snapshot.pdf, bytes)


def test_decodes_text_buffers_as_utf8_rather_than_a_platform_default(
    client: shojiku.Client,
) -> None:
    # The engine echoes an unknown font family back verbatim, so a non-ASCII
    # name proves the diagnostics buffer survives the crossing intact. Windows
    # is a first-class target and its default codec differs.
    family = "日本語フォント"
    result = client.generate_source(
        template=source_template(
            text_item("customer.name"), style=f"{{ fontFamily: {family}, fontSize: 10.5 }}"
        ),
        params={"customer": {"name": "x"}},
    )

    echoed = [d for d in result.diagnostics if d.code == "unknown_font_family"]
    assert echoed, [d.code for d in result.diagnostics]
    assert family in (echoed[0].message or "")
    assert echoed[0].args["family"] == family


def test_carries_non_ascii_params_across_the_boundary_intact(client: shojiku.Client) -> None:
    # The encode side of the same crossing: the request envelope is UTF-8 bytes,
    # so a Japanese customer name must reach the engine and change the output.
    japanese = client.generate("receipt", {"customer": {"name": "山田商事株式会社"}})
    ascii_only = client.generate("receipt", {"customer": {"name": "Yamada Shoji K.K."}})

    assert japanese.success
    assert japanese.unwrap().bytes != ascii_only.unwrap().bytes


def test_decodes_the_success_flag_at_the_width_the_c_type_declares(
    engine: Any, font_dirs: list[str], locale_dirs: list[str]
) -> None:
    # The out-parameter whose width is silently wrong in the classic failure:
    # `success` is an int32, and a decoder that read it at the wrong width
    # returns false for everything while the string buffers beside it decode
    # perfectly. Both verdicts are proven, not just the true one.
    request = Request(
        sources=Sources(template=source_template(text_item("customer.name"))),
        params={"customer": {"name": "x"}},
        font_dirs=font_dirs,
        locale_dirs=locale_dirs,
    ).encoded()

    worked = engine.render(request)
    refused = engine.verify(pdf=b"not a pdf", anchors=b"")

    assert worked.success is True
    assert refused.success is False


def test_surfaces_the_c_surfaces_caller_error_level_as_a_non_zero_status(engine: Any) -> None:
    # Two levels, and they are not the same thing. A malformed request is the
    # caller's fault and comes back as a status; a refused document is an
    # outcome and comes back as success == False with diagnostics.
    assert engine.render(b"not json at all").status == 3
    assert engine.verify(pdf=b"not a pdf", anchors=b"").status == 0


def test_raises_usage_error_for_an_input_past_the_c_surfaces_own_cap(
    client: shojiku.Client,
) -> None:
    with pytest.raises(shojiku.UsageError, match="the engine refused the call"):
        client.generate("receipt", {"padding": "a" * (8 * 1024 * 1024)})
