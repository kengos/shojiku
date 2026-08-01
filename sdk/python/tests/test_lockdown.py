"""The input ceiling, one clause at a time.

A lockdown tested as a whole reports "something was refused" and stops proving
which rule did it.
"""

from __future__ import annotations

from typing import Any

import pytest

import shojiku
from conftest import source_template, text_item
from shojiku.lockdown import Lockdown


@pytest.fixture
def providers(signer: shojiku.LocalPem) -> dict[str, Any]:
    return {"invoice": signer}


@pytest.fixture
def strict_client(make_client: Any, providers: dict[str, Any]) -> shojiku.Client:
    return make_client(strict=True, providers=providers)


class TestTheEntrancesItCloses:
    def test_refuses_the_bytes_first_entrance(self, strict_client: shojiku.Client) -> None:
        # So every document this client signs came from the root.
        with pytest.raises(shojiku.UsageError, match="`generate_source` is disabled"):
            strict_client.generate_source(template="irrelevant", params={})

    def test_still_renders_from_the_template_root(self, strict_client: shojiku.Client) -> None:
        result = strict_client.generate("receipt", {"customer": {"name": "Yamada Shoji K.K."}})

        assert result.success

    def test_refuses_to_sign_a_document_handed_to_it_whole(
        self, strict_client: shojiku.Client, signed: shojiku.DocumentArtifact
    ) -> None:
        loaded = strict_client.artifact(signed.bytes)

        with pytest.raises(
            shojiku.UsageError, match="only a document rendered from its own template"
        ):
            strict_client.sign(loaded, "invoice")

    def test_refuses_to_sign_another_clients_bytes_first_render(
        self, strict_client: shojiku.Client, client: shojiku.Client
    ) -> None:
        # The gap a boolean "was it loaded" would leave open: these bytes WERE
        # laid out by the engine, from a template the caller supplied. Same
        # trust class as handing over the PDF.
        elsewhere = client.generate_source(
            template=source_template(text_item("customer.name")), params={}
        ).unwrap()

        assert elsewhere.origin == shojiku.Origin.SOURCE
        with pytest.raises(shojiku.UsageError, match="this one is source"):
            strict_client.sign(elsewhere, "invoice")

    def test_verifies_a_loaded_artifact_all_the_same(
        self, strict_client: shojiku.Client, signed: shojiku.DocumentArtifact, keys: str
    ) -> None:
        # Verification is never restricted. A locked-down deployment is
        # precisely the one that has to check an archived document it did not
        # produce, and refusing that would make strict a reason to skip verifying.
        loaded = strict_client.artifact(signed.bytes)

        assert loaded.verify(anchors=f"{keys}/rsa2048.cert.pem").success


class TestSigningMaterial:
    def test_signs_with_the_name_of_a_registered_provider(
        self, strict_client: shojiku.Client, rendered: shojiku.DocumentArtifact
    ) -> None:
        result = strict_client.sign(rendered, "invoice")

        assert result.success
        assert result.unwrap().bytes.startswith(b"%PDF-")

    def test_refuses_a_provider_object_so_key_paths_stay_out_of_request_handling(
        self,
        strict_client: shojiku.Client,
        rendered: shojiku.DocumentArtifact,
        signer: shojiku.LocalPem,
    ) -> None:
        with pytest.raises(shojiku.UsageError, match="not with a provider object"):
            strict_client.sign(rendered, signer)

    def test_names_an_unregistered_provider_without_echoing_anything_else(
        self, strict_client: shojiku.Client, rendered: shojiku.DocumentArtifact
    ) -> None:
        with pytest.raises(shojiku.UsageError, match="no signing provider named `payroll`"):
            strict_client.sign(rendered, "payroll")

    def test_strips_control_characters_out_of_the_name_it_echoes(
        self, strict_client: shojiku.Client, rendered: shojiku.DocumentArtifact
    ) -> None:
        # The name reaches an exception reporter and a log line, so it is
        # bounded and stripped exactly as a template name is. Written as an
        # ESCAPE so this file never carries a raw control byte.
        with pytest.raises(shojiku.UsageError, match="named `payroll`"):
            strict_client.sign(rendered, "pay\x00roll\x7f")

    def test_resolves_a_registered_name_on_a_client_that_is_not_strict(
        self, make_client: Any, providers: dict[str, Any], rendered: shojiku.DocumentArtifact
    ) -> None:
        # Naming providers is good practice everywhere; only REFUSING the
        # alternative belongs to strict.
        assert make_client(providers=providers).sign(rendered, "invoice").success

    def test_still_takes_a_provider_object_when_the_client_is_not_strict(
        self,
        client: shojiku.Client,
        rendered: shojiku.DocumentArtifact,
        signer: shojiku.LocalPem,
    ) -> None:
        assert client.sign(rendered, signer).success


class TestPrecedence:
    def test_keeps_strictness_a_configured_operator_declaration_cannot_lift(
        self, make_client: Any
    ) -> None:
        # The one place `configure` beats a call site. Strictness is a
        # restriction rather than a default: an operator who declared a lockdown
        # must not have it lifted by application code, or the ceiling is only a
        # suggestion.
        shojiku.configure(strict=True)

        with pytest.raises(shojiku.UsageError, match="`generate_source` is disabled"):
            make_client(strict=False).generate_source(template="x", params={})

    def test_is_off_unless_something_turns_it_on(self) -> None:
        assert not Lockdown(strict=False).strict
        assert Lockdown(strict=True).strict


def test_refusals_are_usage_errors_not_failed_results(strict_client: shojiku.Client) -> None:
    # Strict disables an ENTRANCE, so calling it is the program contradicting
    # its own deployment's configuration — not a fact about a document — and a
    # failed result is something `if result.success:` can swallow.
    with pytest.raises(shojiku.UsageError):
        strict_client.generate_source(template="x", params={})
