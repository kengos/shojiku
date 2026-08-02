#!/usr/bin/env python3
"""Regenerate the Designer's Google-Fonts catalog snapshot (authoring-time only).

Emits `gui/designer-app/data/font-catalog.json` — the checked-in catalog the
Designer's font picker searches. The picker never calls a font API at runtime:
it reads this snapshot, then fetches only the face bytes + license text the
user actually picks, from the commit-pinned raw.githubusercontent.com URLs
recorded here.

Two unauthenticated sources, one request each (no API key, no secret):

- `fonts.google.com/metadata/fonts` — family, category, subsets, popularity
  (a rank: 1 = most popular; the picker's default sort), and `axes` (the
  variable-font marker).
- `api.github.com/repos/google/fonts/git/trees/<sha>?recursive=1` — the whole
  repo tree in ONE call, giving each family's real face file names and its
  license file.

What is deliberately EXCLUDED, and why:

- **Variable families** (`axes` non-empty). The google/fonts repo holds only
  the variable font for them (`Roboto[wdth,wght].ttf`), and PDF has no
  variable-font concept — embedding one renders the default instance with
  synthetic bold. Static faces only. This is what keeps Roboto / Open Sans /
  Inter / Montserrat out of the snapshot; widening to them needs the Google
  Fonts Developer API (a key), which is a separate follow-up.
- **`ufl/` families** — the snapshot carries OFL-1.1 and Apache-2.0 only, the
  two licenses whose redistribution terms the generated pack satisfies by
  shipping the license text beside the font.
- **Faces the engine cannot select.** The engine's axes are weight
  normal|bold x style normal|italic, so only Regular / Bold / Italic /
  BoldItalic are emitted; a family's Thin/Light/Black/SemiBold faces are
  dropped rather than offered and ignored.

The commit sha is resolved once at generation time and pinned into every URL,
so a face's bytes can never change under its recorded sha256 (an `@latest`-
style moving URL would break the pin on the next upstream republish).

CI never runs this script.

Usage: python3 scripts/gen-font-catalog.py [--ref <sha-or-branch>]
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import urllib.request

METADATA_URL = "https://fonts.google.com/metadata/fonts"
GITHUB_API = "https://api.github.com/repos/google/fonts"
RAW_BASE = "https://raw.githubusercontent.com/google/fonts"

OUT_PATH = (
    pathlib.Path(__file__).resolve().parent.parent
    / "gui"
    / "designer-app"
    / "data"
    / "font-catalog.json"
)

# Licence directory prefix -> the SPDX id recorded in the generated pack
# manifest. `ufl/` is intentionally absent (see the module docstring).
LICENSES = {"ofl": "OFL-1.1", "apache": "Apache-2.0"}

# The four faces the engine can select, mapped to their manifest variant keys.
# Order is the emitted face order (Regular first: it is the family's default).
FACES = [
    ("Regular", {}),
    ("Bold", {"weight": "bold"}),
    ("Italic", {"style": "italic"}),
    ("BoldItalic", {"weight": "bold", "style": "italic"}),
]

LICENSE_FILES = ("OFL.txt", "LICENSE.txt")


def fetch(url: str) -> bytes:
    """GET a URL, failing loudly. Authoring-time only; never in a render path."""
    req = urllib.request.Request(url, headers={"User-Agent": "shojiku-gen-font-catalog"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def fetch_json(url: str):
    raw = fetch(url).decode("utf-8")
    # The metadata endpoint prefixes its JSON with an anti-hijack guard.
    return json.loads(raw[raw.index("{") :] if raw.startswith(")]}'") else raw)


def slug(family: str) -> str:
    """The repo directory name for a family: lowercase, alphanumerics only."""
    return re.sub(r"[^a-z0-9]", "", family.lower())


def build_tree_index(ref: str) -> dict[str, tuple[str, set[str]]]:
    """Map each family directory to its (license id, file names).

    One recursive-tree request covers the whole repo. Bail out loudly if
    GitHub truncates it — a silently short tree would drop families rather
    than fail, and the snapshot would look merely smaller, not broken.
    """
    tree = fetch_json(f"{GITHUB_API}/git/trees/{ref}?recursive=1")
    if tree.get("truncated"):
        sys.exit("github tree response was truncated; cannot build a complete catalog")
    dirs: dict[str, tuple[str, set[str]]] = {}
    for entry in tree["tree"]:
        parts = entry["path"].split("/")
        if len(parts) != 3 or parts[0] not in LICENSES:
            continue
        license_dir, family_dir, name = parts
        dirs.setdefault(family_dir, (license_dir, set()))[1].add(name)
    return dirs


def family_entry(meta: dict, dirs: dict[str, tuple[str, set[str]]], ref: str) -> dict | None:
    """Build one catalog entry, or None when the family is not usable.

    Skips: variable families, families absent from the repo (or under a
    licence we do not carry), families with no Regular face, and families
    whose licence text is missing.
    """
    if meta["axes"]:
        return None
    directory = slug(meta["family"])
    found = dirs.get(directory)
    if found is None:
        return None
    license_dir, names = found
    stem = meta["family"].replace(" ", "")

    faces = []
    for suffix, variant in FACES:
        name = f"{stem}-{suffix}.ttf"
        if name not in names:
            continue
        faces.append(
            {
                "file": name,
                "url": f"{RAW_BASE}/{ref}/{license_dir}/{directory}/{name}",
                **variant,
            }
        )
    # A family without a Regular is unusable: Regular is the default face the
    # generated manifest points `family` at.
    if not faces or not faces[0]["file"].endswith("-Regular.ttf"):
        return None

    license_file = next((f for f in LICENSE_FILES if f in names), None)
    if license_file is None:
        return None

    return {
        "id": directory,
        "family": meta["family"],
        "category": meta["category"],
        "popularity": meta["popularity"],
        "subsets": sorted(s for s in meta["subsets"] if s != "menu"),
        "license": LICENSES[license_dir],
        "licenseFile": license_file,
        "licenseUrl": f"{RAW_BASE}/{ref}/{license_dir}/{directory}/{license_file}",
        "faces": faces,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref", default="main", help="branch or sha to pin (default: main)")
    args = parser.parse_args()

    ref = fetch_json(f"{GITHUB_API}/commits/{args.ref}")["sha"]
    print(f"pinning google/fonts at {ref}", file=sys.stderr)

    metadata = fetch_json(METADATA_URL)["familyMetadataList"]
    dirs = build_tree_index(ref)

    families = [e for m in metadata if (e := family_entry(m, dirs, ref)) is not None]
    families.sort(key=lambda e: e["id"])

    snapshot = {"version": 1, "ref": ref, "families": families}
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(snapshot, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        f"wrote {OUT_PATH.relative_to(pathlib.Path.cwd())}: "
        f"{len(families)} families of {len(metadata)} ({len(metadata) - len(families)} skipped)",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
