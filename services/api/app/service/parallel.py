"""Run independent blocking reads (B2 GETs, Label Studio lists) side by side.

Each read is a network round trip of a few hundred ms, so a loop over N
projects or N JSON records costs N round trips back to back. A small thread
pool overlaps them. The width stays under botocore's default connection pool
(10), so threads never queue for a connection.
"""

from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor

MAX_WORKERS = 8


def parallel_map[T, R](fn: Callable[[T], R], items: Iterable[T]) -> list[R]:
    """`[fn(x) for x in items]`, in order, overlapped. Re-raises the first error."""
    items = list(items)
    if len(items) <= 1:
        return [fn(x) for x in items]
    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(items))) as pool:
        return list(pool.map(fn, items))
