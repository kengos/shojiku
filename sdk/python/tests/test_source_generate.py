"""The bytes-first entrance: no root, no containment, and no file reads."""

from __future__ import annotations

from typing import Any

import shojiku
from conftest import FIXTURE_TEMPLATES, SOURCE_ASSETS, source_template, text_item

PARAMS = {"customer": {"name": "Yamada Shoji K.K."}}

IMAGE_ITEM = (
    "- id: logo\n  type: image\n  box: { x: 0, y: 0, w: 40, h: 40 }\n  src: assets/logo.svg\n"
)


def rootless(make_client: Any) -> shojiku.Client:
    """A client with NO template root at all — the bytes-first deployment."""
    return make_client(templates=None)


def test_renders_sources_handed_over_as_bytes_with_no_template_root_configured(
    make_client: Any,
) -> None:
    result = rootless(make_client).generate_source(
        template=source_template(text_item("customer.name")), params=PARAMS
    )

    assert result.success
    assert result.unwrap().bytes.startswith(b"%PDF-")


def test_has_no_template_root_to_demand_unlike_the_name_entrance(make_client: Any) -> None:
    client = rootless(make_client)

    assert client.template_root is None
    assert client.generate_source(
        template=source_template(text_item("customer.name")), params=PARAMS
    ).success


def test_marks_what_it_rendered_as_coming_from_caller_supplied_sources(
    make_client: Any,
) -> None:
    artifact = (
        rootless(make_client)
        .generate_source(template=source_template(text_item("customer.name")), params=PARAMS)
        .unwrap()
    )

    assert artifact.origin == shojiku.Origin.SOURCE


def test_takes_params_as_yaml_not_only_as_json(make_client: Any) -> None:
    result = rootless(make_client).generate_source(
        template=source_template(text_item("customer.name")),
        params="customer:\n  name: From YAML\n",
    )

    assert result.success


def test_renders_in_the_locale_the_call_names(make_client: Any) -> None:
    result = rootless(make_client).generate_source(
        template=source_template(text_item("customer.name")), params=PARAMS, lang="ja-JP"
    )

    assert result.success


class TestDefinitions:
    # An undeclared key is only a warning while nothing declares the schema, and
    # an error once something does.
    TEMPLATE = source_template(text_item("customer.rank"))
    DEFINITIONS = (
        "version: 0.2.0\n"
        "type: object\n"
        "properties:\n"
        "  customer:\n"
        "    type: object\n"
        "    properties:\n"
        "      name: { type: string }\n"
    )

    def test_only_warns_about_an_unbound_key_when_no_definitions_declare_one(
        self, make_client: Any
    ) -> None:
        result = rootless(make_client).generate_source(template=self.TEMPLATE, params=PARAMS)

        assert result.success
        assert [d.code for d in result.warnings] == ["missing_data"]

    def test_refuses_the_same_document_once_definitions_declare_the_schema(
        self, make_client: Any
    ) -> None:
        result = rootless(make_client).generate_source(
            template=self.TEMPLATE, definitions=self.DEFINITIONS, params=PARAMS
        )

        assert result.failed
        assert [d.code for d in result.errors] == ["unknown_data_key"]


class TestAssetsDir:
    # Bundled assets belong to a template, not to a deployment, which is why the
    # directory is a per-call argument here rather than client configuration.
    def test_resolves_a_bundled_asset_against_the_directory_the_call_names(
        self, make_client: Any
    ) -> None:
        result = rootless(make_client).generate_source(
            template=source_template(IMAGE_ITEM), assets_dir=SOURCE_ASSETS, params={}
        )

        assert result.success

    def test_disables_bundled_sources_when_no_directory_is_given(self, make_client: Any) -> None:
        # Inline sources have no directory of their own.
        result = rootless(make_client).generate_source(
            template=source_template(IMAGE_ITEM), params={}
        )

        assert result.failed
        assert [d.code for d in result.errors] == ["assets_root_missing"]

    def test_refuses_a_bundled_source_that_climbs_out_of_the_assets_directory(
        self, make_client: Any
    ) -> None:
        climbing = (
            "- id: logo\n"
            "  type: image\n"
            "  box: { x: 0, y: 0, w: 40, h: 40 }\n"
            "  src: ../../../../etc/hostname\n"
        )

        result = rootless(make_client).generate_source(
            template=source_template(climbing), assets_dir=SOURCE_ASSETS, params={}
        )

        assert result.failed
        assert [d.code for d in result.errors] == ["asset_traversal"]


def test_treats_a_path_shaped_template_as_source_text_never_as_a_path_to_read(
    make_client: Any,
) -> None:
    # An SDK that "helpfully" opened it would make every containment rule
    # bypassable by spelling the same thing differently. The proof is that a
    # real, readable template PATH comes back as a PARSE failure.
    real_path = f"{FIXTURE_TEMPLATES}/receipt/templates.yml"

    result = rootless(make_client).generate_source(template=real_path, params=PARAMS)

    assert result.failed
    assert result.failure is not None
    assert result.failure.kind == "parse"
