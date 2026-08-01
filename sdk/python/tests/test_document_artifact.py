"""The artifact: bytes, metadata, and the provenance a strict client signs on."""

from __future__ import annotations

from pathlib import Path

import shojiku
from shojiku.artifact import DocumentArtifact


def test_hands_over_pdf_bytes_as_binary(rendered: shojiku.DocumentArtifact) -> None:
    # PDF bytes are not text; decoding them is how a document gets corrupted on
    # the way to disk.
    assert isinstance(rendered.bytes, bytes)
    assert rendered.bytes.startswith(b"%PDF-")
    assert rendered.size == len(rendered.bytes)


def test_writes_the_exact_bytes_nuls_and_all(
    rendered: shojiku.DocumentArtifact, tmp_path: Path
) -> None:
    target = tmp_path / "receipt.pdf"

    written = rendered.write(str(target))

    assert written == str(target)
    assert target.read_bytes() == rendered.bytes


def test_carries_the_diagnostics_its_render_emitted(client: shojiku.Client) -> None:
    artifact = client.generate("warns", {}).unwrap()

    assert [d.code for d in artifact.diagnostics] == ["text_overflow"]


def test_reports_the_page_count_the_engine_laid_out(
    rendered: shojiku.DocumentArtifact,
) -> None:
    assert rendered.page_count == 1


def test_knows_a_rendered_document_came_from_the_template_root(
    rendered: shojiku.DocumentArtifact,
) -> None:
    assert rendered.origin == shojiku.Origin.RENDERED
    assert not rendered.loaded


class TestAnArchivedDocumentReadBackIn:
    def test_verifies_bytes_that_were_signed_some_time_ago(
        self, client: shojiku.Client, signed: shojiku.DocumentArtifact, keys: str
    ) -> None:
        loaded = client.artifact(signed.bytes)

        assert loaded.verify(anchors=f"{keys}/rsa2048.cert.pem").success

    def test_can_be_signed_again_since_appending_a_revision_is_what_signing_does(
        self,
        client: shojiku.Client,
        rendered: shojiku.DocumentArtifact,
        signer: shojiku.LocalPem,
    ) -> None:
        # An archived document that has not been signed yet. Re-signing an
        # already-signed one is a separate question the ENGINE answers (it
        # refuses a document that already carries an interactive form), not
        # something this binding decides.
        archived = client.artifact(rendered.bytes)

        result = archived.sign(signer)

        assert result.success
        assert result.unwrap().bytes.startswith(archived.bytes)

    def test_reports_no_page_count_having_measured_nothing(
        self, client: shojiku.Client, signed: shojiku.DocumentArtifact
    ) -> None:
        assert client.artifact(signed.bytes).page_count is None

    def test_knows_the_bytes_came_from_the_caller(
        self, client: shojiku.Client, signed: shojiku.DocumentArtifact
    ) -> None:
        loaded = client.artifact(signed.bytes)

        assert loaded.origin == shojiku.Origin.LOADED
        assert loaded.loaded

    def test_keeps_its_origin_through_a_signature(
        self,
        client: shojiku.Client,
        rendered: shojiku.DocumentArtifact,
        signer: shojiku.LocalPem,
    ) -> None:
        # Signing inherits the origin of what it signed: appending a revision
        # does not launder where the document came from.
        loaded = client.artifact(rendered.bytes)

        assert loaded.sign(signer).unwrap().origin == shojiku.Origin.LOADED
        assert rendered.sign(signer).unwrap().origin == shojiku.Origin.RENDERED

    def test_assumes_the_least_privileged_origin_when_nobody_says(
        self, client: shojiku.Client
    ) -> None:
        # Every internal path states the origin explicitly, so the default only
        # ever applies to an artifact somebody built by hand — which must not
        # become signable under a lockdown by omission.
        built_by_hand = DocumentArtifact(bytes_=b"%PDF-", diagnostics=[], client=client)

        assert built_by_hand.origin == shojiku.Origin.LOADED
