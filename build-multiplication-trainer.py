#!/usr/bin/env python3
"""
Package the H5P.MultiplicationTrainer content type into a ready-to-upload .h5p
file. Run it with no arguments for the default German 1x1 (Einmaleins) package,
or pass options to tweak the content. Works on Windows and Linux (standard
library only).

Examples:
    python build-multiplication-trainer.py
    python build-multiplication-trainer.py --title "Einmaleins" --seconds 90
    python build-multiplication-trainer.py --min 2 --max 12 --lang en
"""

import argparse
import json
import os
import re
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
LIBRARY_NAME = "H5P.MultiplicationTrainer"
DEFAULT_LANG = "en"

# The real library source lives in a plain, unversioned folder; the versioned
# name is only used for the folder inside the .h5p archive.
LIBRARY_DIR = os.path.join(HERE, LIBRARY_NAME)
LIBRARY_PATH = os.path.join(LIBRARY_DIR, "library.json")
SEMANTICS_PATH = os.path.join(LIBRARY_DIR, "semantics.json")
LANGUAGE_DIR = os.path.join(LIBRARY_DIR, "language")


def read_library_version():
    """Read the library version (major, minor, patch, title) from library.json so the
    build always matches the library it ships. Never auto-incremented: bump the
    numbers in library.json by hand when you change the library."""
    with open(LIBRARY_PATH, encoding="utf-8") as handle:
        library = json.load(handle)
    return (
        library['majorVersion'],
        library['minorVersion'],
        library['patchVersion'],
        library['title']
    )


LIBRARY_MAJOR, LIBRARY_MINOR, LIBRARY_PATCH, LIBRARY_TITLE = read_library_version()
# H5P requires the in-archive library folder and dependencies to use only
# major.minor; the full major.minor.patch is used for the output filename.
LIBRARY_VERSION = f"{LIBRARY_MAJOR}.{LIBRARY_MINOR}"
LIBRARY_FULL_VERSION = f"{LIBRARY_MAJOR}.{LIBRARY_MINOR}.{LIBRARY_PATCH}"
LIBRARY_FOLDER = f"{LIBRARY_NAME}-{LIBRARY_VERSION}"


def build_content(args):
    """Assemble the content.json parameters dictionary.

    Only the structural settings are stored here. The interface texts (intro
    and the l10n group) are deliberately left out: that way the H5P editor
    fills them from the library's language files for the language the author
    picks, and switching the language in the editor keeps working instead of
    being overridden by baked-in values.
    """
    return {
        "durationSeconds": args.seconds,
        "minFactor": args.min,
        "maxFactor": args.max,
    }


def build_manifest():
    """Assemble the h5p.json manifest."""
    return {
        "title": LIBRARY_TITLE,
        "language": DEFAULT_LANG,
        "mainLibrary": LIBRARY_NAME,
        "embedTypes": ["iframe"],
        "license": "U",
        "defaultLanguage": DEFAULT_LANG,
        "preloadedDependencies": [
            {
                "machineName": LIBRARY_NAME,
                "majorVersion": LIBRARY_MAJOR,
                "minorVersion": LIBRARY_MINOR,
            }
        ],
    }


def add_tree(archive, src_dir, arc_prefix):
    """Add every file under src_dir to the archive under arc_prefix, using
    forward-slash paths so the zip is valid on any platform."""
    for root, _dirs, files in os.walk(src_dir):
        for name in files:
            full = os.path.join(root, name)
            rel = os.path.relpath(full, src_dir)
            arcname = arc_prefix + "/" + rel.replace(os.sep, "/")
            archive.write(full, arcname)

def main():
    default_title = f"{LIBRARY_TITLE.replace(' ', '_')}-{LIBRARY_FULL_VERSION}"
    parser = argparse.ArgumentParser(
        description="Build a Multiplication Trainer .h5p package."
    )
    parser.add_argument(
        "--seconds", type=int, default=60, help="practice time in seconds"
    )
    parser.add_argument("--min", type=int, default=1, help="smallest factor")
    parser.add_argument("--max", type=int, default=10, help="largest factor")
    parser.add_argument(
        "--output", default=None, help=f"output .h5p path (default: {default_title}.h5p)"
    )
    args = parser.parse_args()

    if not os.path.isdir(LIBRARY_DIR):
        parser.error(f"Library folder not found: {LIBRARY_DIR}")

    output = args.output or f"{default_title}.h5p"
    content = build_content(args)
    manifest = build_manifest()

    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("h5p.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        archive.writestr(
            "content/content.json", json.dumps(content, ensure_ascii=False, indent=2)
        )
        add_tree(archive, LIBRARY_DIR, LIBRARY_FOLDER)

    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
