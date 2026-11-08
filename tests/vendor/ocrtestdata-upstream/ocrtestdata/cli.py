"""
Command-line interface for ocrtestdata.

Pipeline behavior:
- Create up to 10 unique PDFs once at startup (or fewer if batch size < 10).
- For each batch interval, copy a random selection of those initial PDFs
  from the temp folder to the destination with new random filenames.
- This avoids regenerating large PDFs repeatedly and speeds up high-volume runs.
- The timer (-t) starts after the copy process finishes for each batch.
- The temp directory is kept for the entire run and cleaned up on exit.
"""

import argparse
import random
import signal
import locale
import sys
import os
import time
import uuid
from pathlib import Path
from typing import List, Optional, Tuple
from concurrent.futures import ProcessPoolExecutor, as_completed

from faker import Faker

from .io_utils import make_temp_dir, cleanup_temp_dir, safe_random_pdf_name, atomic_copy
from .generator import generate_pdf

# Global stats (updated during run)
_stats = {
    "files_copied": 0,
    "pages_provided": 0,
    "start_time": None,
    "end_time": None,
}

# Flag to indicate user requested stop
_stop_requested = False


def _signal_handler(signum, frame):
    """
    Signal handler for graceful shutdown.
    """
    global _stop_requested
    _stop_requested = True


def _parse_args():
    parser = argparse.ArgumentParser(description="Generate image-based PDF test data for OCR testing.")
    parser.add_argument("-b", type=int, default=1, help="number of PDFs to create in a batch (default: 1)")
    parser.add_argument("-t", type=int, default=0, help="timer in seconds between batches (default: 0). Minimum one batch even if 0.")
    parser.add_argument("-r", "--run-duration", type=float, default=0.0, help="total run duration limit in seconds; 0 means no duration limit (default: 0)")
    parser.add_argument("-l", "--locale", type=str, default=None, help="locale for Faker (default: system locale)")
    parser.add_argument("-p", type=int, default=10, help="number of pages per PDF (default: 10)")
    parser.add_argument("--qr", type=str, default=None, help="If provided, every 3rd page will be a QR page containing this text")
    parser.add_argument("--dpi", type=int, default=300, help="DPI for page images (default: 300)")
    parser.add_argument("-o", "--output", type=str, default=".", help="output directory for PDFs (default: current working directory)")
    return parser.parse_args()


def _generate_single_pdf(temp_dir: str,
                         pages_per_pdf: int,
                         dpi: int,
                         qr_text: Optional[str],
                         locale: str) -> Optional[Tuple[str, int]]:
    """Helper function to generate one PDF in a separate process."""
    try:
        temp_name = f"{uuid.uuid4().hex}_{Faker(locale).file_name(extension='pdf')}"
        temp_path = Path(temp_dir) / temp_name
        local_faker = Faker(locale)
        pages = generate_pdf(local_faker, str(temp_path), pages_per_pdf, dpi, qr_text)
        return str(temp_path), pages
    except Exception as e:
        print(f"Error generating PDF {temp_path}: {e}", file=sys.stderr)
        return None

def _create_initial_unique_pdfs(
    faker: Faker,
    temp_dir: str,
    unique_count: int,
    pages_per_pdf: int,
    dpi: int,
    qr_text: Optional[str],
    locale: str,
) -> List[Tuple[str, int]]:
    """
    Create up to unique_count unique PDFs in temp_dir ONCE at startup.
    Returns a list of tuples (temp_path, pages) for the created files.
    """
    created: List[Tuple[str, int]] = []

    # Use CPU count - 1 workers (at least 1)
    max_workers = max(1, os.cpu_count() - 1)

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(
                _generate_single_pdf,
                temp_dir,
                pages_per_pdf,
                dpi,
                qr_text,
                locale,
            )
            for _ in range(unique_count)
        ]

        for future in as_completed(futures):
            try:
                result = future.result()
                if result is not None:
                    created.append(result)
                    print("... one unique PDF was created")
            except Exception as e:
                # Catch any worker crash and continue
                print(f"Worker failed: {e}", file=sys.stderr)
                continue

    return created

def _copy_batch_from_initial_set(
    faker: Faker,
    initial_files: List[Tuple[str, int]],
    batch_size: int,
    output_dir: Path,
    run_duration: float,
    start_time: float,
) -> None:
    """
    Copy batch_size files to output_dir by randomly selecting from initial_files.
    Each copied file receives a new random filename (UUID + faker file name).
    Updates global _stats for files and pages.

    If run_duration > 0, this function checks elapsed time before copying each file
    and stops copying further files if the run duration has been exceeded.
    """
    global _stats, _stop_requested

    if not initial_files:
        print("No initial files available to copy for this batch.")
        return

    for i in range(batch_size):
        if _stop_requested:
            break
        # Check run_duration before copying each file
        if run_duration > 0.0:
            elapsed = time.time() - start_time
            if elapsed >= run_duration:
                _stop_requested = True
                break

        # Choose a random source file from the initial set
        src_path, pages = random.choice(initial_files)

        # Generate a safe destination filename (ensures no overwrite)
        dest_name = safe_random_pdf_name(faker, output_dir)
        try:
            atomic_copy(src_path, str(output_dir), dest_name)
        except FileExistsError:
            # Extremely unlikely due to safe_random_pdf_name, but handle gracefully by retrying once
            dest_name = safe_random_pdf_name(faker, output_dir)
            atomic_copy(src_path, str(output_dir), dest_name)

        # Update stats
        _stats["files_copied"] += 1
        _stats["pages_provided"] += pages

        # Short status message
        print(f"Copied {_stats['files_copied']}: {dest_name} ({pages} pages)")

def get_system_locale():
    loc, _ = locale.getdefaultlocale()
    return loc if loc else "en_US"  # fallback if None

def main():
    """
    Entry point for the CLI.

    Pipeline:
    1. Parse args and initialize.
    2. Create a temporary directory and generate up to min(batch_size, 10) unique PDFs once.
    3. Immediately perform the first batch copy by randomly selecting from the initial set.
    4. If timer > 0 and run not stopped, wait timer seconds (timer starts AFTER copying finished),
       then repeat step 3 (copy another batch from the same initial set).
    5. Continue until user interrupts, run-duration is exceeded, or timer==0 (single run).
    6. Clean up temp dir and print summary.
    """
    global _stats, _stop_requested

    args = _parse_args()

    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, _signal_handler)
    try:
        signal.signal(signal.SIGTERM, _signal_handler)
    except Exception:
        # Some platforms may not support SIGTERM
        pass

    # Normalize and validate args
    batch_size = max(0, args.b)
    timer = max(0, args.t)
    run_duration = max(0.0, args.run_duration)
    locale = get_system_locale() if args.locale == None else args.locale
    pages_per_pdf = max(1, args.p)
    qr_text = args.qr
    dpi = max(72, args.dpi)
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    # Ensure at least one batch is created even if batch_size is 0
    if batch_size == 0:
        batch_size = 1

    # Initialize Faker
    faker = Faker(locale) if locale else Faker()

    # Initialize stats
    _stats["start_time"] = time.time()
    _stats["files_copied"] = 0
    _stats["pages_provided"] = 0

    print(f"Starting ocrtestdata: batch_size={batch_size}, timer={timer}, run_duration={run_duration}, pages_per_pdf={pages_per_pdf}, dpi={dpi}, output={output_dir}")

    # Create a persistent temp dir for the whole run so we can reuse the initial files
    temp_dir = make_temp_dir()
    initial_files: List[Tuple[str, int]] = []

    try:
        # Create up to 10 unique PDFs once at startup (or fewer if batch_size < 10)
        unique_to_create = min(batch_size, 10)
        # If user requested more than 10 in the batch, we still only create 10 unique files to reuse
        unique_to_create = min(unique_to_create, 10)
        print(f"Generating {unique_to_create} unique PDF(s) in temporary directory for reuse...")
        initial_files = _create_initial_unique_pdfs(faker, temp_dir, unique_to_create, pages_per_pdf, dpi, qr_text, locale)

        if not initial_files:
            print("No initial PDFs could be generated. Exiting.")
            return

        # Main loop: perform copy batches until stop requested or run_duration exceeded
        while not _stop_requested:
            # Check run_duration before starting the batch copy
            if run_duration > 0.0:
                elapsed = time.time() - _stats["start_time"]
                if elapsed >= run_duration:
                    break

            # Copy a batch by randomly selecting from initial_files
            _copy_batch_from_initial_set(faker, initial_files, batch_size, output_dir, run_duration, _stats["start_time"])

            # If timer is zero, run only one batch and exit
            if timer <= 0:
                break

            # Start the timer AFTER the copy process finished for this batch
            waited = 0.0
            sleep_step = 0.5
            while waited < timer and not _stop_requested:
                # If run_duration is set, compute remaining allowed time and break early if needed
                if run_duration > 0.0:
                    elapsed = time.time() - _stats["start_time"]
                    remaining = run_duration - elapsed
                    if remaining <= 0:
                        _stop_requested = True
                        break
                    # Sleep only up to remaining if it's smaller than the next step
                    step = min(sleep_step, remaining, timer - waited)
                else:
                    step = min(sleep_step, timer - waited)
                time.sleep(step)
                waited += step

            # Loop will continue and perform another copy batch if not stopped
    except KeyboardInterrupt:
        _stop_requested = True
    finally:
        # Clean up the persistent temp dir that held the initial PDFs
        cleanup_temp_dir(temp_dir)

        _stats["end_time"] = time.time()
        elapsed_total = _stats["end_time"] - _stats["start_time"] if _stats["start_time"] else 0.0

        print("\n--- Summary ---")
        print(f"Total files provided: {_stats['files_copied']}")
        print(f"Total pages provided: {_stats['pages_provided']}")
        print(f"Total time (s): {elapsed_total:.2f}")
        print("Cleanup complete. Exiting.")
