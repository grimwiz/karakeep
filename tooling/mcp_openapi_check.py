#!/usr/bin/env python3
"""Utility script to validate Karakeep OpenAPI access via the MCP bridge."""

from __future__ import annotations

import argparse
import sys
from typing import Any, Iterable

import requests

DEFAULT_LIMIT = 6
TIMEOUT_SECONDS = 30


class VerificationError(RuntimeError):
    """Raised when an assertion about the API responses fails."""


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Validate the Karakeep API via its OpenAPI endpoints. "
            "The script mirrors the MCP OpenAPI interactions that Open WebUI uses."
        )
    )
    parser.add_argument(
        "--api-addr",
        required=True,
        help=(
            "Base address for the Karakeep API (e.g. https://example.com). "
            "Matches the KARAKEEP_API_ADDR environment variable."
        ),
    )
    parser.add_argument(
        "--api-key",
        required=True,
        help="API key used for authorization. Matches KARAKEEP_API_KEY.",
    )
    parser.add_argument(
        "--query",
        default="bookmarks",
        help="Query string to issue for the bookmark search (default: %(default)s).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help="Number of bookmarks to request per page (default: %(default)s).",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=TIMEOUT_SECONDS,
        help="HTTP timeout in seconds (default: %(default)s).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print additional diagnostic information.",
    )
    return parser.parse_args(argv)


def build_base_url(addr: str) -> str:
    return addr.rstrip("/") + "/api/v1"


def fetch_openapi_spec(session: requests.Session, base_url: str, timeout: int) -> dict[str, Any]:
    url = f"{base_url}/openapi.json"
    response = session.get(url, timeout=timeout)
    response.raise_for_status()
    return response.json()


def ensure_openapi_paths(spec: dict[str, Any]) -> None:
    if "paths" not in spec:
        raise VerificationError("OpenAPI spec does not contain a 'paths' section.")
    required_paths = ["/bookmarks/search"]
    missing = [path for path in required_paths if path not in spec["paths"]]
    if missing:
        raise VerificationError(f"OpenAPI spec is missing required paths: {', '.join(missing)}")


def perform_search(
    session: requests.Session,
    base_url: str,
    api_key: str,
    query: str,
    limit: int,
    cursor: str | None,
    timeout: int,
) -> dict[str, Any]:
    params = {
        "q": query,
        "limit": limit,
        "includeContent": "false",
    }
    if cursor:
        params["cursor"] = cursor
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }
    response = session.get(
        f"{base_url}/bookmarks/search",
        params=params,
        headers=headers,
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()


def extract_bookmark_ids(payload: dict[str, Any]) -> list[str]:
    bookmarks = payload.get("bookmarks")
    if not isinstance(bookmarks, list):
        raise VerificationError("Search payload did not include a 'bookmarks' list.")
    ids: list[str] = []
    for item in bookmarks:
        bookmark_id = item.get("id") if isinstance(item, dict) else None
        if not isinstance(bookmark_id, str):
            raise VerificationError("Bookmark entry is missing a string 'id'.")
        ids.append(bookmark_id)
    return ids


def ensure_unique(ids: Iterable[str]) -> None:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for bookmark_id in ids:
        if bookmark_id in seen:
            duplicates.add(bookmark_id)
        seen.add(bookmark_id)
    if duplicates:
        duplicate_list = ", ".join(sorted(duplicates))
        raise VerificationError(f"Duplicate bookmark IDs detected: {duplicate_list}")


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    base_url = build_base_url(args.api_addr)

    session = requests.Session()

    if args.verbose:
        print(f"Checking OpenAPI spec at {base_url}/openapi.json")
    spec = fetch_openapi_spec(session, base_url, args.timeout)
    ensure_openapi_paths(spec)

    if args.verbose:
        print("Requesting first page of bookmark search results")
    first_page = perform_search(
        session,
        base_url,
        args.api_key,
        args.query,
        args.limit,
        cursor=None,
        timeout=args.timeout,
    )
    first_ids = extract_bookmark_ids(first_page)
    if len(first_ids) != args.limit:
        raise VerificationError(
            f"Expected {args.limit} bookmarks on first page, received {len(first_ids)}."
        )
    ensure_unique(first_ids)

    next_cursor = first_page.get("nextCursor")
    if not isinstance(next_cursor, str):
        raise VerificationError("First page did not include a usable 'nextCursor'.")

    if args.verbose:
        print("Requesting second page of bookmark search results")
    second_page = perform_search(
        session,
        base_url,
        args.api_key,
        args.query,
        args.limit,
        cursor=next_cursor,
        timeout=args.timeout,
    )
    second_ids = extract_bookmark_ids(second_page)
    if len(second_ids) != args.limit:
        raise VerificationError(
            f"Expected {args.limit} bookmarks on second page, received {len(second_ids)}."
        )
    ensure_unique(second_ids)

    overlap = set(first_ids) & set(second_ids)
    if overlap:
        raise VerificationError(
            "Second page shared bookmark IDs with the first page: "
            + ", ".join(sorted(overlap))
        )

    if args.verbose:
        print("All checks passed successfully.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except VerificationError as exc:  # pragma: no cover - convenience for manual runs
        print(f"Verification failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    except requests.HTTPError as exc:  # pragma: no cover - convenience for manual runs
        print(f"HTTP request failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
