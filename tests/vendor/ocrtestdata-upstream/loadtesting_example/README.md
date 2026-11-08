# loadtesting‑script.sh

`loadtesting-script.sh` is a helper script designed to orchestrate multiple parallel `ocrtestdata` processes. It provides a simple way to generate sustained, realistic OCR workloads for load, stress, endurance, or performance testing. Use it as a starting point and adapt it as needed.

While **ocrtestdata** itself generates image‑based PDF files, this script focuses on **running several instances at once**, managing their lifecycle, and shutting them down cleanly.

---

## Purpose

This script is useful when you want to:

- Simulate **high‑throughput OCR pipelines**
- Run **multiple independent generators** in parallel
- Produce **mixed document types** (different batch sizes, DPI, page counts, QR settings)
- Perform **long‑running endurance tests**
- Ensure **clean shutdown** of all generators with a single keypress

It acts as a lightweight load‑test harness around the `ocrtestdata` CLI.

---

## How It Works

- Starts **three** `ocrtestdata` processes in the background  
- All processes share:
  - the same **run duration** (`-r`)
  - the same **output directory** (`-o`)
  - the same **text locale** (`-l`)
- Each process uses different parameters to simulate different document types
- The script waits for user confirmation
- When the user presses **ENTER**, all running processes receive a **SIGINT** (the same signal as Ctrl+C)
- A `trap` ensures that even if the script is interrupted, all child processes are terminated cleanly

---

## Script Variables

You can adjust these at the top of the script:

```bash
RUNTIME=1201      # total run duration for all processes (-r)
OUTDIR="./out"    # output directory for generated PDFs (-o)
TEXTLOCALE="de_DE" # locale for generated text (-l)
```

---

## Usage

Make the script executable:

```bash
chmod +x loadtesting-script.sh
```

Run it:

```bash
./loadtesting-script.sh
```

The script will:

1. Start three parallel `ocrtestdata` generators  
2. Print their PIDs  
3. Wait for you to press **ENTER**  
4. Stop all generators gracefully  

---

## Example Output

```
Started ocrtestdata processes:
  PID1 = 12345
  PID2 = 12346
  PID3 = 12347

Press ENTER to stop all ocrtestdata processes...
```

---

## Requirements

- `ocrtestdata` installed from PyPI:

```bash
pip install ocrtestdata
```

- Bash shell (Linux or macOS)

---

## Notes

- The script creates the output directory if it does not exist.
- All processes write into the same output folder; if you prefer separate folders, adjust the `-o` parameter per process.
- You can add or remove processes depending on your load‑testing needs.
