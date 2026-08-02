"""The entry point: both entrances, the precedence rules, and the two levels."""

from __future__ import annotations

import json
from typing import Any

import pytest

import shojiku
from conftest import FIXTURE_TEMPLATES
from shojiku.request import Request
from shojiku.sources import Sources

PARAMS = {"customer": {"name": "Yamada Shoji K.K."}}


class TestEngineInfo:
    def test_reports_what_this_build_can_do_before_any_template_exists(
        self, make_client: Any
    ) -> None:
        info = make_client(templates=None).engine_info()

        assert "version" in info
        assert "capabilities" in info
        assert "builtinLocales" in info

    def test_hands_the_payload_over_as_a_plain_dict_unmodelled(
        self, client: shojiku.Client
    ) -> None:
        # An append-only wire this SDK does not model: a typed value object
        # would owe a new field in seven languages every time the engine adds one.
        assert type(client.engine_info()) is dict


class TestGenerate:
    def test_renders_a_template_with_params_and_hands_back_the_bytes(
        self, client: shojiku.Client
    ) -> None:
        result = client.generate("receipt", PARAMS)

        assert result.success
        assert result.unwrap().bytes.startswith(b"%PDF-")
        assert result.unwrap().page_count == 1

    def test_accepts_params_that_are_already_a_json_string(self, client: shojiku.Client) -> None:
        result = client.generate("receipt", '{"customer": {"name": "From JSON"}}')

        assert result.success

    def test_accepts_params_that_are_yaml_since_the_engine_parses_either(
        self, client: shojiku.Client
    ) -> None:
        result = client.generate("receipt", "customer:\n  name: From YAML\n")

        assert result.success

    def test_treats_no_params_as_an_empty_document_rather_than_refusing(
        self, client: shojiku.Client
    ) -> None:
        assert client.generate("warns").success

    def test_succeeds_with_diagnostics_attached_when_the_engine_only_warns(
        self, client: shojiku.Client
    ) -> None:
        result = client.generate("warns", {})

        assert result.success
        assert [d.code for d in result.warnings] == ["text_overflow"]
        assert result.errors == []

    def test_fails_with_the_engines_diagnostics_when_the_document_is_refused(
        self, client: shojiku.Client
    ) -> None:
        result = client.generate("broken", {})

        assert result.failed
        assert [d.code for d in result.errors] == ["image_source_missing"]

    def test_preserves_the_diagnostic_code_and_its_typed_arguments_verbatim(
        self, client: shojiku.Client
    ) -> None:
        # `code` and `args` are the engine's frozen contract; a translating
        # consumer renders its own message from them.
        warning = client.generate("warns", {}).warnings[0]

        assert warning.code == "text_overflow"
        assert warning.args == {"avail": 24.0, "content": 25.2}
        assert warning.path == "sections.body.items[0]"

    def test_reports_the_sdks_own_lifecycle_step_not_the_engines_internal_stage(
        self, client: shojiku.Client
    ) -> None:
        # The engine's error object names an internal stage; passing it through
        # would make the trace's step mean different things by layer.
        failure = client.generate("broken", {}).failure

        assert failure is not None
        assert failure.step == shojiku.Step.GENERATE

    def test_returns_a_failed_result_for_a_refused_template_name(
        self, client: shojiku.Client
    ) -> None:
        # A hostile name is a fact about the request, not a bug in the program.
        result = client.generate("../escape", {})

        assert result.failed
        assert result.failure is not None
        assert result.failure.kind == "template_name"

    def test_raises_for_a_template_name_that_is_not_a_string(self, client: shojiku.Client) -> None:
        with pytest.raises(shojiku.UsageError, match="a template name must be a str"):
            client.generate(None, {})  # type: ignore[arg-type]

    def test_still_returns_a_failed_result_for_a_hostile_string_name(
        self, client: shojiku.Client
    ) -> None:
        assert client.generate("", {}).failed

    def test_carries_the_underlying_io_cause_under_a_name_that_resolved_to_nothing(
        self, client: shojiku.Client
    ) -> None:
        result = client.generate("no-such-template", {})

        assert result.failure is not None
        assert result.failure.kind == "template_not_found"
        assert [f.kind for f in result.failure.causes] == ["template_not_found", "io"]

    def test_raises_when_no_template_root_is_configured_at_all(self, make_client: Any) -> None:
        with pytest.raises(shojiku.UsageError, match="no template root"):
            make_client(templates=None).generate("receipt", {})


class TestThePerCallLocale:
    # Ruby derives a client (`with_lang`) because a keyword beside its
    # trailing-hash params would break the ordinary call form. Python's params
    # are an ordinary argument, so the frozen contract's per-call option applies
    # directly. What every SDK mirrors is the PRECEDENCE, not the spelling.
    def test_renders_in_the_locale_the_call_names(self, client: shojiku.Client) -> None:
        assert client.generate("receipt", PARAMS, lang="ja-JP").success

    def test_beats_the_locale_the_client_was_built_with(self, make_client: Any) -> None:
        client = make_client(lang="en-US")

        with_override = client.generate("receipt", PARAMS, lang="ja-JP")
        without = client.generate("receipt", PARAMS)

        assert with_override.success
        assert without.success
        assert with_override.unwrap().bytes != without.unwrap().bytes

    def test_leaves_the_clients_own_locale_in_force_when_the_call_names_none(
        self, make_client: Any
    ) -> None:
        explicit = make_client(lang="ja-JP").generate("receipt", PARAMS)
        per_call = make_client().generate("receipt", PARAMS, lang="ja-JP")

        assert explicit.unwrap().bytes == per_call.unwrap().bytes


class TestTheTemplateRoot:
    def test_prefers_an_explicit_templates_over_the_environment(
        self, engine_library: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("SHOJIKU_TEMPLATE_ROOT", "/from/env")

        client = shojiku.Client(templates=FIXTURE_TEMPLATES, library=engine_library, env=True)

        assert client.template_root is not None
        assert client.template_root.path == FIXTURE_TEMPLATES

    def test_falls_back_to_shojiku_template_root_when_nothing_was_configured(
        self, engine_library: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("SHOJIKU_TEMPLATE_ROOT", FIXTURE_TEMPLATES)

        client = shojiku.Client(library=engine_library, env=True)

        assert client.template_root is not None
        assert client.template_root.path == FIXTURE_TEMPLATES

    def test_ignores_the_environment_entirely_when_env_is_false(
        self, engine_library: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("SHOJIKU_TEMPLATE_ROOT", FIXTURE_TEMPLATES)

        assert shojiku.Client(library=engine_library, env=False).template_root is None

    def test_reads_the_font_and_locale_directories_from_the_environment_too(
        self,
        engine_library: str,
        monkeypatch: pytest.MonkeyPatch,
        font_dirs: list[str],
        locale_dirs: list[str],
    ) -> None:
        monkeypatch.setenv("SHOJIKU_FONT_DIR", font_dirs[0])
        monkeypatch.setenv("SHOJIKU_LOCALE_DIR", locale_dirs[0])
        monkeypatch.setenv("SHOJIKU_TEMPLATE_ROOT", FIXTURE_TEMPLATES)

        client = shojiku.Client(library=engine_library, env=True)

        assert client.generate("receipt", PARAMS).success


class TestTheTwoLevelsOfFailure:
    def test_reports_a_missing_locale_pack_as_a_failed_result(self, make_client: Any) -> None:
        # A document/pack problem is an OUTCOME: status zero, success false.
        client = make_client(locale_dirs=[])

        result = client.generate("receipt", PARAMS, lang="zz-ZZ")

        assert result.failed

    def test_raises_its_own_error_for_params_that_cannot_be_serialized_as_json(
        self, client: shojiku.Client
    ) -> None:
        # A bare TypeError escaping from `generate` would make callers catch a
        # foreign class they never invited into their code.
        with pytest.raises(shojiku.UsageError, match="could not be serialized"):
            client.generate("receipt", {"customer": object()})

    def test_raises_its_own_error_for_params_that_are_not_encodable_utf8(
        self, client: shojiku.Client
    ) -> None:
        with pytest.raises(shojiku.UsageError, match="could not be serialized"):
            client.generate("receipt", {"customer": "\ud800"})


class TestTheRequestEnvelope:
    """The one envelope both entrances build."""

    def test_drops_a_key_the_engine_may_not_receive_rather_than_sending_it_as_null(
        self,
    ) -> None:
        # The C surface has ONE request schema and it REJECTS unknown keys, so a
        # key with nothing to say must be absent — not present with a null. The
        # bytes entrance relies on exactly this every time it is called without
        # definitions or an assets directory.
        envelope = json.loads(
            Request(sources=Sources(template="version: 0.1.0\n"), params={}).encoded()
        )

        assert "definitions" not in envelope
        assert "assetsDir" not in envelope
        assert "lang" not in envelope
        assert envelope["template"] == "version: 0.1.0\n"

    def test_passes_a_string_params_through_verbatim(self) -> None:
        # The engine parses JSON or YAML, so re-encoding a caller's own source
        # text here would only be a chance to change it.
        yaml_source = "customer:\n  name: Yamada Shoji K.K.\n"

        envelope = json.loads(Request(sources=Sources(template="t"), params=yaml_source).encoded())

        assert envelope["params"] == yaml_source

    def test_encodes_the_envelope_as_utf8_bytes_for_the_c_surface(self) -> None:
        encoded = Request(sources=Sources(template="t"), params={"name": "山田商事"}).encoded()

        assert isinstance(encoded, bytes)
        assert "山田商事" in encoded.decode("utf-8")
