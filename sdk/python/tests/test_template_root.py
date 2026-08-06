r"""Template names are identifiers, and the rejection rules are the UNION across
platforms — one test per claim.

Windows is a first-class target, so a backslash is a separator, `C:name` is
drive-relative, `\\host\share` is a UNC path and `CON`/`NUL` are reserved
devices — every one of them refused on EVERY platform.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

import shojiku
from conftest import FIXTURE_TEMPLATES
from shojiku.template_root import RejectedError, TemplateRoot

ROOT = TemplateRoot(FIXTURE_TEMPLATES)

# Every refused name class, one case each. The `..` and absolute-path entries
# are subsumed by the separator rule, and are listed separately anyway because
# they are the classes the contract names.
REFUSED_NAMES = [
    ("an empty name", ""),
    ("a whitespace-only name", "   "),
    ("an absolute path", "/etc/passwd"),
    ("a parent-directory traversal", "../outside"),
    ("a forward-slash separator", "nested/receipt"),
    ("a backslash separator", "nested\\receipt"),
    ("a Windows drive-relative name", "C:receipt"),
    ("a UNC path", "\\\\host\\share"),
    # Written as an ESCAPE, never as a raw byte: a literal control character in
    # a source file makes it binary-classified and it vanishes from every grep.
    ("a control character", "recei\x00pt"),
    ("a newline", "receipt\nother"),
    ("the CON device", "CON"),
    ("the NUL device", "NUL"),
    ("a numbered COM device", "COM1"),
    ("a numbered LPT device", "LPT9"),
    ("a device with a trailing dot", "CON."),
    ("a device with a trailing space", "CON "),
    ("a device with an extension", "NUL.yml"),
]


class TestANameThatResolves:
    def test_yields_the_template_its_definitions_and_the_assets_directory(self) -> None:
        sources = ROOT.resolve("receipt")

        assert "name: receipt" in sources.template
        assert sources.definitions is not None
        assert "customer" in sources.definitions
        assert sources.assets_dir == str(Path(FIXTURE_TEMPLATES).resolve() / "receipt")

    def test_leaves_definitions_none_when_the_template_has_none(self) -> None:
        assert ROOT.resolve("warns").definitions is None


class TestNamesItRefuses:
    # One case per refused CLASS, each named after the class it stands for, so a
    # failure says which rule stopped working rather than "case 7".
    @pytest.mark.parametrize(
        "name",
        [name for _, name in REFUSED_NAMES],
        ids=[description for description, _ in REFUSED_NAMES],
    )
    def test_refuses(self, name: str) -> None:
        with pytest.raises(RejectedError) as caught:
            ROOT.resolve(name)

        assert caught.value.kind == "template_name"


class TestNamesThatAreNotNamesAtAll:
    # A name is an IDENTIFIER, so a non-string is a bug in the calling program
    # rather than a hostile request.
    @pytest.mark.parametrize("name", [None, 1, ["receipt"], Path("receipt")])
    def test_raises_rather_than_refusing_it_as_a_request(self, name: object) -> None:
        with pytest.raises(shojiku.UsageError, match="a template name must be a str"):
            ROOT.resolve(name)  # type: ignore[arg-type]

    def test_still_refuses_an_empty_string_as_a_request_rather_than_as_misuse(self) -> None:
        # An empty string can arrive straight from a form field.
        with pytest.raises(RejectedError):
            ROOT.resolve("")


class TestContainmentAfterCanonicalization:
    def test_does_not_follow_a_symlink_that_leaves_the_root(self, tmp_path: Path) -> None:
        # The check a name-shape rule cannot make: a symlink passes every rule
        # above and still points out of the root.
        outside = tmp_path / "outside" / "escape"
        outside.mkdir(parents=True)
        (outside / "templates.yml").write_text("version: 0.1.0\n", encoding="utf-8")
        root = tmp_path / "root"
        root.mkdir()
        (root / "escape").symlink_to(outside)

        with pytest.raises(RejectedError) as caught:
            TemplateRoot(str(root)).resolve("escape")

        assert caught.value.kind == "template_escapes_root"

    def test_accepts_a_symlink_that_stays_inside_the_root(self, tmp_path: Path) -> None:
        root = tmp_path / "root"
        (root / "real").mkdir(parents=True)
        (root / "real" / "templates.yml").write_text("version: 0.1.0\n", encoding="utf-8")
        (root / "alias").symlink_to(root / "real")

        assert TemplateRoot(str(root)).resolve("alias").template == "version: 0.1.0\n"


class TestNamesThatResolveToNothingUsable:
    def test_reports_a_name_with_no_directory_behind_it(self) -> None:
        with pytest.raises(RejectedError) as caught:
            ROOT.resolve("no-such-template")

        assert caught.value.kind == "template_not_found"
        assert caught.value.cause_message is not None

    def test_reports_a_directory_with_no_templates_yml_in_it(self, tmp_path: Path) -> None:
        (tmp_path / "empty").mkdir()

        with pytest.raises(RejectedError) as caught:
            TemplateRoot(str(tmp_path)).resolve("empty")

        assert caught.value.kind == "template_unreadable"

    def test_reports_a_root_that_is_not_a_directory(self, tmp_path: Path) -> None:
        not_a_directory = tmp_path / "file.txt"
        not_a_directory.write_text("", encoding="utf-8")

        with pytest.raises(RejectedError) as caught:
            TemplateRoot(str(not_a_directory)).resolve("receipt")

        assert caught.value.kind == "template_not_found"

    def test_reports_a_root_that_does_not_exist(self, tmp_path: Path) -> None:
        with pytest.raises(RejectedError) as caught:
            TemplateRoot(str(tmp_path / "nope")).resolve("receipt")

        assert caught.value.kind == "template_not_found"

    def test_reports_a_templates_yml_that_cannot_be_read_as_a_file(self, tmp_path: Path) -> None:
        # A DIRECTORY where the template should be, rather than a chmod: the
        # gate container runs as root, which ignores permission bits entirely,
        # so a 0o000 fixture would prove nothing and pass anyway.
        (tmp_path / "odd" / "templates.yml").mkdir(parents=True)

        with pytest.raises(RejectedError) as caught:
            TemplateRoot(str(tmp_path)).resolve("odd")

        assert caught.value.kind == "template_unreadable"
        assert caught.value.cause_message is not None


def test_bounds_the_name_it_echoes_back_since_a_refusal_reaches_logs() -> None:
    with pytest.raises(RejectedError) as caught:
        ROOT.resolve("a" * 200 + "/x")

    # Bounded at 80 characters, so a hostile name cannot flood a log line.
    assert "a" * 80 in str(caught.value)
    assert "a" * 81 not in str(caught.value)


def test_strips_control_characters_out_of_the_name_it_echoes_back() -> None:
    with pytest.raises(RejectedError) as caught:
        ROOT.resolve("recei\x00pt/x")

    # The NUL is gone and everything around it survives: stripping, not
    # truncating at the first control byte.
    assert "\x00" not in str(caught.value)
    assert "`receipt/x`" in str(caught.value)


def test_uses_the_platform_separator_in_the_assets_directory_it_reports() -> None:
    assert ROOT.resolve("receipt").assets_dir.endswith(f"{os.sep}receipt")


class TestTheShapeOfTheRoot:
    """The root itself, not the name.

    Everything else here constrains the NAME; what a root may look like was
    never pinned, and the .NET SDK drifted there — its canonical form kept a
    trailing separator while the parents it compared against did not, so
    ``templates/`` could never contain anything. Python is immune because
    ``Path.resolve`` drops the separator; these pin that rather than leaving it
    to the implementation it happens to use.
    """

    @pytest.mark.parametrize("suffix", ["", "/", "//"])
    def test_a_trailing_separator_on_the_root_still_resolves(self, suffix: str) -> None:
        sources = TemplateRoot(FIXTURE_TEMPLATES + suffix).resolve("receipt")

        assert "name: receipt" in sources.template

    @pytest.mark.parametrize("suffix", ["", "/"])
    def test_a_relative_root_resolves(self, suffix: str) -> None:
        # Expressed relative to the current directory rather than by changing
        # it: the process cwd is global state and moving it is a trap for
        # every other test.
        relative = os.path.relpath(FIXTURE_TEMPLATES)
        assert not Path(relative).is_absolute()

        sources = TemplateRoot(relative + suffix).resolve("receipt")

        assert "name: receipt" in sources.template

    def test_a_trailing_separator_does_not_follow_a_symlink_out(self, tmp_path: Path) -> None:
        # Normalizing the root must not loosen containment.
        outside = tmp_path / "outside" / "escape"
        outside.mkdir(parents=True)
        (outside / "templates.yml").write_text("version: 0.1.0\n", encoding="utf-8")
        root = tmp_path / "root"
        root.mkdir()
        (root / "escape").symlink_to(outside)

        with pytest.raises(RejectedError) as caught:
            TemplateRoot(f"{root}/").resolve("escape")

        assert caught.value.kind == "template_escapes_root"

    def test_a_sibling_sharing_the_roots_prefix_is_not_inside_it(self, tmp_path: Path) -> None:
        # A string prefix compare would accept `<root>-evil`; containment is
        # structural. Normalizing the root is what makes that mistake reachable,
        # so it is pinned here rather than left to the five SDKs that had it.
        evil = tmp_path / "root-evil" / "receipt"
        evil.mkdir(parents=True)
        (evil / "templates.yml").write_text("version: 0.1.0\n", encoding="utf-8")
        root = tmp_path / "root"
        root.mkdir()
        (root / "receipt").symlink_to(evil)

        with pytest.raises(RejectedError) as caught:
            TemplateRoot(f"{root}/").resolve("receipt")

        assert caught.value.kind == "template_escapes_root"
