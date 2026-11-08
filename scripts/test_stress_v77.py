#!/usr/bin/env python3
# Compatibility wrapper; v7.71 real-navigation stress is authoritative.
import runpy,pathlib
runpy.run_path(str(pathlib.Path(__file__).with_name('test_stress_v771.py')),run_name='__main__')
