#!/usr/bin/env python3
# Compatibility wrapper; v7.71 strict capture is authoritative.
import runpy,pathlib
runpy.run_path(str(pathlib.Path(__file__).with_name('universal_capture_v771.py')),run_name='__main__')
