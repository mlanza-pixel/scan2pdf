"""
I/O utilities: temporary directory management, atomic copy, filename generation,
and safe destination checks.

This module intentionally avoids touching destination files after copying.
"""

import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Tuple


def make_temp_dir() -> str:
    """
    Create and return a path to a temporary directory.
    The caller should ensure cleanup (rmdir) when done.
    """
    return tempfile.mkdtemp(prefix="ocrtestdata_")


def cleanup_temp_dir(path: str) -> None:
    """
    Remove a temporary directory and its contents. Ignore errors.
    """
    try:
        shutil.rmtree(path)
    except Exception:
        pass


def safe_random_pdf_name(faker, dest_dir: Path) -> str:
    """
    Create a random filename using a UUID to avoid collisions.
    Ensure the name does not already exist in dest_dir. If it does, retry.
    Returns the filename only (not full path).
    """
    for _ in range(10_000):
        # Use uuid4 to avoid collisions
        name = f"{uuid.uuid4().hex}.pdf"
        if not (dest_dir / name).exists():
            return name
    # Fallback: guaranteed unique uuid
    return f"{uuid.uuid4().hex}.pdf"


def atomic_copy(src: str, dest_dir: str, dest_name: str) -> str:
    """
    Copy src file to dest_dir/dest_name. Do not overwrite existing files.
    If dest exists, raise FileExistsError.
    Returns the full destination path.
    """
    dest_dir_path = Path(dest_dir)
    dest_dir_path.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir_path / dest_name
    if dest_path.exists():
        raise FileExistsError(f"Destination file already exists: {dest_path}")
    # Use copy2 to preserve timestamps where possible; we must not move the file.
    shutil.copy2(src, dest_path)
    return str(dest_path)


def a4_pixels(dpi: int) -> Tuple[int, int]:
    """
    Return pixel dimensions for A4 at given DPI.
    A4 size: 210 x 297 mm = 8.2677165 x 11.6929134 inches
    """
    inches_w = 210.0 / 25.4
    inches_h = 297.0 / 25.4
    return int(round(inches_w * dpi)), int(round(inches_h * dpi))
