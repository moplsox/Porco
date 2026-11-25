#!/usr/bin/env python3
"""Cache pixel-exact, lossless WebP encodings for PNGs in the art manifest.

This packaging helper never changes source artwork or assets/manifest.json.
Only files under .cache/standalone-art are written. Run it from any directory.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from hashlib import sha256
from io import BytesIO
import json
import os
from pathlib import Path
import sys
from time import monotonic
from typing import Any

from PIL import Image, features

ROOT = Path(__file__).resolve().parent.parent
ART_MANIFEST = ROOT / "assets" / "manifest.json"
CACHE_DIR = ROOT / ".cache" / "standalone-art"
CACHE_MANIFEST = CACHE_DIR / "manifest.json"
WORKERS = 3


def digest(data: bytes) -> str:
    return sha256(data).hexdigest()


def inside_root(relative_path: str) -> Path:
    resolved = (ROOT / relative_path).resolve()
    if not resolved.is_relative_to(ROOT):
        raise ValueError(f"Resource escapes project directory: {relative_path}")
    return resolved


def png_references(value: Any) -> set[str]:
    """Read literal PNG paths from all nested manifest values, deduplicated."""
    if isinstance(value, str):
        if value.lower().endswith(".png"):
            path = inside_root(value)
            return {path.relative_to(ROOT).as_posix()}
        return set()
    if isinstance(value, dict):
        return set().union(*(png_references(item) for item in value.values()))
    if isinstance(value, list):
        return set().union(*(png_references(item) for item in value))
    return set()


def read_previous() -> dict[str, Any]:
    try:
        value = json.loads(CACHE_MANIFEST.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def cached_entry(entry: Any, source_hash: str, source: bytes) -> dict[str, Any] | None:
    if not isinstance(entry, dict) or entry.get("sourceSha256") != source_hash:
        return None
    if entry.get("mime") not in ("image/png", "image/webp"):
        return None
    try:
        candidate = inside_root(entry["path"])
        if entry["mime"] == "image/webp" and not candidate.is_relative_to(CACHE_DIR):
            return None
        data = source if entry["mime"] == "image/png" else candidate.read_bytes()
        if len(data) != entry.get("bytes") or digest(data) != entry.get("sha256"):
            return None
    except (KeyError, OSError, TypeError, ValueError):
        return None
    # Entries are written only after a full decoded-RGBA comparison succeeds.
    return {key: entry[key] for key in ("path", "mime", "sourceSha256", "sha256", "bytes")}


def encode_one(
    relative_source: str, target_name: str, previous: dict[str, Any]
) -> tuple[str, dict[str, Any], int, bool]:
    source_path = inside_root(relative_source)
    raw = source_path.read_bytes()
    source_hash = digest(raw)
    hit = cached_entry(previous.get(relative_source), source_hash, raw)
    if hit is not None:
        return relative_source, hit, len(raw), True

    with Image.open(BytesIO(raw)) as original:
        if original.format != "PNG":
            raise ValueError(f"Expected PNG contents: {relative_source}")
        original.load()
        original_rgba = original.convert("RGBA")
        # WebP supports RGB/RGBA directly. Other PNG modes are expanded without
        # resizing, quantizing, changing colors, or losing transparent RGB.
        encoding_image = original if original.mode in ("RGB", "RGBA") else original_rgba
        options: dict[str, Any] = {
            "format": "WEBP",
            "lossless": True,
            "method": 4,
            "exact": True,
        }
        for field in ("icc_profile", "exif", "xmp"):
            if isinstance(original.info.get(field), bytes):
                options[field] = original.info[field]
        output = BytesIO()
        encoding_image.save(output, **options)
        encoded = output.getvalue()

        with Image.open(BytesIO(encoded)) as decoded:
            decoded.load()
            restored = decoded.convert("RGBA")
            if restored.size != original_rgba.size:
                raise ValueError(f"WebP dimensions changed: {relative_source}")
            if restored.tobytes() != original_rgba.tobytes():
                raise ValueError(f"WebP decoded RGBA pixels differ: {relative_source}")

    if len(encoded) >= len(raw):
        entry = {
            "path": relative_source,
            "mime": "image/png",
            "sourceSha256": source_hash,
            "sha256": source_hash,
            "bytes": len(raw),
        }
    else:
        target = CACHE_DIR / target_name
        temporary = target.with_suffix(target.suffix + ".tmp")
        temporary.write_bytes(encoded)
        os.replace(temporary, target)
        entry = {
            "path": target.relative_to(ROOT).as_posix(),
            "mime": "image/webp",
            "sourceSha256": source_hash,
            "sha256": digest(encoded),
            "bytes": len(encoded),
        }
    return relative_source, entry, len(raw), False


def main() -> int:
    started = monotonic()
    if not features.check("webp"):
        print("Cannot encode standalone art: Pillow has no WebP support.", file=sys.stderr)
        return 1
    manifest = json.loads(ART_MANIFEST.read_text(encoding="utf-8"))
    references = sorted(png_references(manifest))
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    previous = read_previous()

    # The current artwork has unique basenames. Handle future directory-based
    # basename collisions deterministically without overwriting another image.
    names: dict[str, str] = {}
    used_names: set[str] = set()
    for source in references:
        filename = Path(source).with_suffix(".webp").name
        if filename in used_names:
            filename = f"{Path(source).stem}-{digest(source.encode())[:10]}.webp"
        used_names.add(filename)
        names[source] = filename

    result: dict[str, Any] = {}
    source_total = 0
    hits = 0
    failures: list[str] = []
    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        pending = {
            executor.submit(encode_one, source, names[source], previous): source
            for source in references
        }
        for future in as_completed(pending):
            source = pending[future]
            try:
                key, entry, original_size, hit = future.result()
                result[key] = entry
                source_total += original_size
                hits += int(hit)
            except Exception as exc:
                failures.append(f"{source}: {exc}")
    if failures:
        for failure in failures:
            print(f"Encoding failed: {failure}", file=sys.stderr)
        return 1

    temporary_manifest = CACHE_MANIFEST.with_suffix(".json.tmp")
    temporary_manifest.write_text(
        json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary_manifest, CACHE_MANIFEST)
    selected_total = sum(entry["bytes"] for entry in result.values())
    ratio = selected_total / source_total if source_total else 1
    webp_count = sum(entry["mime"] == "image/webp" for entry in result.values())
    mib = 1024 * 1024
    print(
        f"Standalone art: {len(references)} PNGs, {webp_count} lossless WebPs, "
        f"{hits} cache hits; {source_total / mib:.2f} → {selected_total / mib:.2f} MiB "
        f"({(1 - ratio) * 100:.2f}% smaller), RGBA pixel-exact; "
        f"{monotonic() - started:.2f}s / {WORKERS} workers."
    )
    print(f"Cache map: {CACHE_MANIFEST.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
