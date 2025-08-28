#!/usr/bin/env python3
"""
Simplified JavaScript replayer - just outputs the replay command
"""

import json
import sys
import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Generate JavaScript replay command")
    parser.add_argument("trace_file", help="Path to the trace JSON file")
    
    args = parser.parse_args()
    
    # Verify trace file exists
    trace_path = Path(args.trace_file)
    if not trace_path.exists():
        print(f"Error: Trace file not found: {args.trace_file}")
        sys.exit(1)
    
    # Load trace
    try:
        with open(trace_path, 'r') as f:
            trace = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"Error loading trace: {e}")
        sys.exit(1)
    
    print("="*60)
    print("JAVASCRIPT REPLAYER COMMAND")
    print("="*60)
    print(f"Trace: {args.trace_file}")
    print(f"Steps: {len(trace.get('steps', []))}")
    print(f"Start URL: {trace.get('startUrl', 'N/A')}")
    print()
    print("INSTRUCTIONS:")
    print("1. Open Chrome and navigate to the start URL")
    print("2. Copy the replayer.js file content to browser console, then run:")
    print()
    print("window.actionReplayer.replay(")
    
    # Output compact JSON
    print(json.dumps(trace, separators=(',', ':')))
    
    print(");")
    print()


if __name__ == "__main__":
    main()