# ocrtestdata

**ocrtestdata** is a utility for generating large volumes of image‑based PDF files designed to test OCR (Optical Character Recognition) systems under real‑world conditions. Whether you’re building an OCR pipeline or validating the resilience of an existing solution, this simple tool helps you simulate demanding workloads.

- Can be used for tests such as:
  - **Load tests** → Tests that measure system performance and scalability under realistic or increasing load.
  - **Stress tests** → Tests that push the system beyond its normal limits to evaluate stability and fault tolerance.
  - **Performance tests** → General tests that assess speed, throughput, and response times.
  - **Endurance tests** → Long-duration tests that run the system under sustained load to detect memory leaks or stability issues.
- Pages are images created with Pillow; text is generated with Faker; QR codes are embedded as images.

## Features
- Multi-page PDFs where each page is an image.
- Language of dummy files can be adjusted using the `locale` option.
- Pages are either text pages or QR pages (every 3rd page if `--qr` is provided).
- The QR codes can be used to simulate separator sheets
- Atomic write: PDFs are created in a temporary directory and then copied to the destination.
- Batch generation: Create large numbers of PDF files with unique filenames in batches.
- Batch rules: if `-b` > 10, duplicates are created from a generated set.
- Run duration option to stop after a total elapsed time or run forever.
- Clean shutdown on Ctrl+C with statistics.

## Installation

You can install **ocrtestdata** directly from PyPI using pip:

```bash
pip install ocrtestdata
```
## CLI

```bash
ocrtestdata --help

usage: ocrtestdata [-h] [-b B] [-t T] [-r RUN_DURATION] [-l LOCALE] [-p P]
                   [--qr QR] [--dpi DPI] [-o OUTPUT]

Generate image-based PDF test data for OCR testing.

options:
  -h, --help            show this help message and exit
  -b B                  number of PDFs to create in a batch (default: 1)
  -t T                  timer in seconds between batches (default: 0). Minimum
                        one batch even if 0.
  -r RUN_DURATION, --run-duration RUN_DURATION
                        total run duration limit in seconds; 0 means no duration
                        limit (default: 0)
  -l LOCALE, --locale LOCALE
                        locale for Faker (default: system locale)
  -p P                  number of pages per PDF (default: 10)
  --qr QR               If provided, every 3rd page will be a QR page
                        containing this text
  --dpi DPI             DPI for page images (default: 300)
  -o OUTPUT, --output OUTPUT
                        output directory for PDFs (default: current working
                        directory)

```
## EXAMPLES

Create one PDF with default settings in the current directory:
```bash
ocrtestdata 
```
Create 30 PDF files with 50 pages of French text each (150 DPI, QR codes) in the ./out directory every 10 seconds for a total duration of 20 minutes.
```bash
ocrtestdata -b 30 -p 50 -l fr_FR --dpi 150 --qr "SEPARATOR" -t 10 -r 1200 -o ./out
```
See https://github.com/digidigital/ocrtestdata/tree/main/loadtesting_example for a scripted example that is a bit more complex.
