#!/usr/bin/env fontforge
"""Import a folder of SVG glyph assets into a FontForge font.

Run with FontForge's Python engine:

    fontforge -script scripts/import_svgs_to_fontforge.py \
      uploads/PROJECT_ID/specimens \
      exports/object-type-demo.otf \
      --family "Object Type Demo"

Optional explicit mapping CSV:

    glyph,svg
    N,object-type-metal-n-thin.svg
    a,object-type-metal-lower-a-thin.svg
    two,object-type-metal-2-thin.svg

The script is intentionally conservative. It creates a usable first-pass font
from SVGs, but production font work still needs proper filled outlines,
kerning, spacing, hinting, and QA in FontForge.
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from pathlib import Path


DEFAULT_ASCENT = 800
DEFAULT_DESCENT = 200
DEFAULT_EM = DEFAULT_ASCENT + DEFAULT_DESCENT
DEFAULT_ADVANCE = 720
DEFAULT_SIDE_BEARING = 60
DEFAULT_TARGET_HEIGHT = 680

NAMED_GLYPHS = {
    "space": (0x20, "space"),
    "zero": (0x30, "zero"),
    "one": (0x31, "one"),
    "two": (0x32, "two"),
    "three": (0x33, "three"),
    "four": (0x34, "four"),
    "five": (0x35, "five"),
    "six": (0x36, "six"),
    "seven": (0x37, "seven"),
    "eight": (0x38, "eight"),
    "nine": (0x39, "nine"),
}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Import every SVG in a folder into a FontForge font."
    )
    parser.add_argument("svg_dir", help="Folder containing SVG glyph files.")
    parser.add_argument("output", help="Output font path, usually .otf, .ttf, or .sfd.")
    parser.add_argument("--family", default="Creative IP Export", help="Font family name.")
    parser.add_argument("--style", default="Regular", help="Font style name.")
    parser.add_argument("--mapping", help="Optional CSV with columns: glyph,svg")
    parser.add_argument("--variant", help="Only import SVGs whose filename contains this variant token, for example thin, regular, or bold.")
    parser.add_argument("--advance", type=int, default=DEFAULT_ADVANCE, help="Default glyph advance width.")
    parser.add_argument("--side-bearing", type=int, default=DEFAULT_SIDE_BEARING, help="Left side bearing after scaling.")
    parser.add_argument("--target-height", type=int, default=DEFAULT_TARGET_HEIGHT, help="Target imported outline height.")
    parser.add_argument("--no-fit", action="store_true", help="Skip scaling and positioning after import.")
    parser.add_argument("--dry-run", action="store_true", help="Print inferred mappings without writing a font.")
    args = parser.parse_args(argv)

    svg_dir = Path(args.svg_dir).expanduser().resolve()
    output = Path(args.output).expanduser().resolve()

    if not svg_dir.is_dir():
        raise SystemExit(f"SVG folder does not exist: {svg_dir}")

    mappings = load_mappings(svg_dir, args.mapping, args.variant)
    if not mappings:
        raise SystemExit(f"No SVG glyphs found in: {svg_dir}")

    if args.dry_run:
        for item in mappings:
            print(f"{item['glyph_name']:12} U+{item['codepoint']:04X} {item['svg']}")
        return 0

    fontforge, ps_mat = import_fontforge_modules()
    font = create_font(fontforge, args.family, args.style)

    for item in mappings:
        import_glyph(
            font,
            ps_mat,
            svg_path=item["svg_path"],
            codepoint=item["codepoint"],
            glyph_name=item["glyph_name"],
            advance=args.advance,
            side_bearing=args.side_bearing,
            target_height=args.target_height,
            fit=not args.no_fit,
        )

    output.parent.mkdir(parents=True, exist_ok=True)
    if output.suffix.lower() == ".sfd":
        font.save(str(output))
    else:
        font.generate(str(output))

    print(f"Wrote {output}")
    print(f"Imported {len(mappings)} glyphs from {svg_dir}")
    return 0


def import_fontforge_modules():
    try:
        import fontforge  # type: ignore
        import psMat  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "This script must run inside FontForge, for example:\n"
            "  fontforge -script scripts/import_svgs_to_fontforge.py <svg_dir> <output.otf>"
        ) from exc

    return fontforge, psMat


def create_font(fontforge, family: str, style: str):
    font = fontforge.font()
    clean_family = family.strip() or "Creative IP Export"
    clean_style = style.strip() or "Regular"
    font.encoding = "UnicodeFull"
    font.em = DEFAULT_EM
    font.ascent = DEFAULT_ASCENT
    font.descent = DEFAULT_DESCENT
    font.familyname = clean_family
    font.fontname = safe_postscript_name(f"{clean_family}-{clean_style}")
    font.fullname = f"{clean_family} {clean_style}".strip()
    return font


def load_mappings(svg_dir: Path, mapping_csv: str | None, variant: str | None) -> list[dict]:
    if mapping_csv:
        return load_csv_mappings(svg_dir, Path(mapping_csv).expanduser())

    mappings = []
    variant_token = variant.lower().strip() if variant else ""
    for svg_path in sorted(svg_dir.glob("*.svg")):
        tokens = filename_tokens(svg_path.stem)
        if variant_token and variant_token not in tokens:
            continue

        inferred = infer_glyph_from_filename(svg_path.name)
        if inferred is None:
            print(f"Skipping unmapped SVG: {svg_path.name}", file=sys.stderr)
            continue

        codepoint, glyph_name = inferred
        mappings.append(
            {
                "svg": svg_path.name,
                "svg_path": svg_path,
                "codepoint": codepoint,
                "glyph_name": glyph_name,
            }
        )

    return dedupe_mappings(mappings)


def load_csv_mappings(svg_dir: Path, mapping_csv: Path) -> list[dict]:
    if not mapping_csv.is_file():
        raise SystemExit(f"Mapping CSV does not exist: {mapping_csv}")

    mappings = []
    with mapping_csv.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if "glyph" not in reader.fieldnames or "svg" not in reader.fieldnames:
            raise SystemExit("Mapping CSV must have columns: glyph,svg")

        for row in reader:
            glyph = (row.get("glyph") or "").strip()
            svg_name = (row.get("svg") or "").strip()
            if not glyph or not svg_name:
                continue

            parsed = parse_glyph_token(glyph, uppercase_bare_alpha=False)
            if parsed is None:
                raise SystemExit(f"Could not parse glyph token in mapping CSV: {glyph}")

            svg_path = svg_dir / svg_name
            if not svg_path.is_file():
                raise SystemExit(f"Mapped SVG does not exist: {svg_path}")

            codepoint, glyph_name = parsed
            mappings.append(
                {
                    "svg": svg_path.name,
                    "svg_path": svg_path,
                    "codepoint": codepoint,
                    "glyph_name": glyph_name,
                }
            )

    return dedupe_mappings(mappings)


def infer_glyph_from_filename(filename: str) -> tuple[int, str] | None:
    stem = Path(filename).stem

    unicode_match = re.search(r"(?:u\+|uni)([0-9a-fA-F]{4,6})", stem)
    if unicode_match:
        codepoint = int(unicode_match.group(1), 16)
        return codepoint, glyph_name_for_codepoint(codepoint)

    tokens = filename_tokens(stem)

    for index, token in enumerate(tokens):
        if token == "lower" and index + 1 < len(tokens) and len(tokens[index + 1]) == 1:
            char = tokens[index + 1]
            if char.isalpha():
                return ord(char.lower()), glyph_name_for_codepoint(ord(char.lower()))

    for token in tokens:
        parsed = parse_glyph_token(token, uppercase_bare_alpha=True)
        if parsed is not None:
            return parsed

    return None


def parse_glyph_token(token: str, uppercase_bare_alpha: bool = False) -> tuple[int, str] | None:
    clean = token.strip()
    lower = clean.lower()

    if lower in NAMED_GLYPHS:
        return NAMED_GLYPHS[lower]

    if re.fullmatch(r"u\+[0-9a-fA-F]{4,6}", clean):
        codepoint = int(clean[2:], 16)
        return codepoint, glyph_name_for_codepoint(codepoint)

    if re.fullmatch(r"uni[0-9a-fA-F]{4,6}", clean):
        codepoint = int(clean[3:], 16)
        return codepoint, glyph_name_for_codepoint(codepoint)

    if len(clean) == 1 and clean.isalpha():
        char = clean.upper() if uppercase_bare_alpha else clean
        codepoint = ord(char)
        return codepoint, glyph_name_for_codepoint(codepoint)

    if len(clean) == 1 and clean.isdigit():
        codepoint = ord(clean)
        return codepoint, glyph_name_for_codepoint(codepoint)

    return None


def dedupe_mappings(mappings: list[dict]) -> list[dict]:
    mappings = sorted(mappings, key=lambda item: duplicate_preference_score(item["svg"]))
    seen = {}
    for item in mappings:
        key = item["codepoint"]
        if key in seen:
            print(
                f"Skipping duplicate U+{key:04X}: {item['svg']} "
                f"(already using {seen[key]['svg']})",
                file=sys.stderr,
            )
            continue
        seen[key] = item
    return list(seen.values())


def filename_tokens(stem: str) -> list[str]:
    return [token for token in re.split(r"[^A-Za-z0-9]+", stem.lower()) if token]


def duplicate_preference_score(filename: str) -> tuple[int, str]:
    tokens = filename_tokens(Path(filename).stem)
    score = 50
    if "regular" in tokens:
        score = 0
    elif "thin" in tokens:
        score = 10
    elif "bold" in tokens:
        score = 20

    if "implied" in tokens or "rings" in tokens:
        score += 5

    return score, filename


def import_glyph(
    font,
    ps_mat,
    svg_path: Path,
    codepoint: int,
    glyph_name: str,
    advance: int,
    side_bearing: int,
    target_height: int,
    fit: bool,
) -> None:
    glyph = font.createChar(codepoint, glyph_name)
    glyph.clear()
    glyph.importOutlines(str(svg_path))

    if fit:
        fit_glyph(glyph, ps_mat, side_bearing=side_bearing, target_height=target_height)

    glyph.width = advance
    try:
        glyph.correctDirection()
        glyph.removeOverlap()
        glyph.simplify()
        glyph.round()
    except Exception as exc:
        print(f"Warning: cleanup failed for {svg_path.name}: {exc}", file=sys.stderr)

    print(f"Imported {svg_path.name} -> {glyph_name} U+{codepoint:04X}")


def fit_glyph(glyph, ps_mat, side_bearing: int, target_height: int) -> None:
    bounds = glyph.boundingBox()
    xmin, ymin, xmax, ymax = bounds
    width = xmax - xmin
    height = ymax - ymin
    if width <= 0 or height <= 0:
        return

    scale = target_height / float(height)
    glyph.transform(ps_mat.translate(-xmin, -ymin))
    glyph.transform(ps_mat.scale(scale))

    xmin, ymin, xmax, ymax = glyph.boundingBox()
    glyph.transform(ps_mat.translate(side_bearing - xmin, -ymin))


def glyph_name_for_codepoint(codepoint: int) -> str:
    if codepoint == 0x20:
        return "space"
    if 0x30 <= codepoint <= 0x39:
        return chr(codepoint)
    if 0x41 <= codepoint <= 0x5A:
        return chr(codepoint)
    if 0x61 <= codepoint <= 0x7A:
        return chr(codepoint)
    return f"uni{codepoint:04X}"


def safe_postscript_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9-]", "", value)[:63] or "CreativeIPExport-Regular"


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
