"""The sources one render runs over.

The template text, the definitions text when there are any, and the directory
bundled assets resolve against.

A value rather than a file layout, because there are two ways to get one and
only one of them involves the filesystem. :class:`~shojiku.template_root.TemplateRoot`
produces it by resolving a NAME; :meth:`~shojiku.client.Client.generate_source`
produces it from bytes the application already has. Everything downstream — the
request envelope, the engine — sees the same object either way, which is what
keeps the second entrance from being a second code path.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Sources:
    """One render's template text, definitions text and assets directory."""

    template: str
    definitions: str | None = None
    assets_dir: str | None = None
