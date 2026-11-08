#!/bin/bash
# This script simulates a more complex scenario with different types of documents.
# Adjust it to reflect your scenario.

# Shared variables
RUNTIME=1201               # total run time for all scripts (-r)
OUTDIR="./out"             # output directory for all scripts (-o)
TEXTLOCALE="de_DE"         # locale used to create dummy text (-l)

# Ensure output directory exists
mkdir -p "$OUTDIR"

# Start ocrtestdata processes in the background
ocrtestdata -b 15 -p 2   -l "$TEXTLOCALE" --dpi 150              -t 30  -r "$RUNTIME" -o "$OUTDIR" &
PID1=$!

ocrtestdata -b 5  -p 30  -l "$TEXTLOCALE" --dpi 300 --qr "SEPARATOR" -t 180 -r "$RUNTIME" -o "$OUTDIR" &
PID2=$!

ocrtestdata -b 2  -p 100 -l "$TEXTLOCALE" --dpi 150              -t 300 -r "$RUNTIME" -o "$OUTDIR" &
PID3=$!

echo "Started ocrtestdata processes:"
echo "  PID1 = $PID1"
echo "  PID2 = $PID2"
echo "  PID3 = $PID3"
echo

# Cleanup function triggered on exit, Ctrl+C, or kill
cleanup() {
    echo "Stopping ocrtestdata processes..."
    kill -SIGINT "$PID1" "$PID2" "$PID3" 2>/dev/null
    wait
    echo "All processes terminated."
}

# Trigger cleanup on script exit or interruption
trap cleanup EXIT

# Wait for user confirmation
read -p "Press ENTER to stop all ocrtestdata processes..."
