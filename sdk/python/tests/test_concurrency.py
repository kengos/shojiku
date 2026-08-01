"""What a long render does to the rest of the process.

The package documents that a render in one thread does not block the others, and
a documented concurrency claim that nothing executes is a claim nobody has
checked. ctypes releases the GIL around a foreign call made through `CDLL` —
which is what this binding opens, never `PyDLL` — so the assertion below is what
that reduces to from an application's point of view.
"""

from __future__ import annotations

import threading
import time

import shojiku
from conftest import source_template


def _long_document(client: shojiku.Client) -> shojiku.Result[shojiku.DocumentArtifact]:
    """Enough content that one render is long enough to observe.

    Items rather than a repeat grid, because the point is the duration of one
    foreign call and a flat list is the least wire to get wrong.
    """
    items = "".join(
        f"- id: line{n}\n"
        "  type: text\n"
        "  box: { x: 0, y: 0, w: 400, h: 16 }\n"
        f'  text: "Line item {n}"\n'
        for n in range(1, 401)
    )
    return client.generate_source(template=source_template(items), params={})


def test_lets_other_python_threads_run_while_a_render_is_in_flight(
    client: shojiku.Client,
) -> None:
    ticks = 0
    stop = threading.Event()

    def ticker() -> None:
        nonlocal ticks
        while not stop.is_set():
            ticks += 1
            time.sleep(0.001)

    thread = threading.Thread(target=ticker)
    thread.start()
    try:
        time.sleep(0.05)
        before = ticks

        result = _long_document(client)

        during = ticks - before
    finally:
        stop.set()
        thread.join()

    assert result.success
    # A thread that never ran would score zero; the margin is wide because this
    # asserts "the GIL was released", not a scheduling rate.
    assert during > 5
