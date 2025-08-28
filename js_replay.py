#!/usr/bin/env python3
"""
JavaScript-based trace replayer using Chrome extension injection.
Replaces Playwright with in-page JavaScript execution for zero automation fingerprints.
"""

import json
import sys
import time
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import Dict, Any
import argparse


class JSTraceReplayer:
    def __init__(self, trace_path: str, verbose: bool = False, incognito: bool = False):
        self.trace_path = trace_path
        self.verbose = verbose
        self.incognito = incognito
        self.trace = None
        self.temp_dir = None

    def log(self, message: str):
        if self.verbose:
            print(f"[JS_REPLAY] {message}")

    def load_trace(self) -> Dict[str, Any]:
        """Load and validate the trace file."""
        try:
            with open(self.trace_path, 'r') as f:
                trace = json.load(f)
            
            if 'steps' not in trace:
                raise ValueError("Invalid trace format: missing 'steps'")
            
            self.log(f"Loaded trace with {len(trace['steps'])} steps")
            return trace
        
        except (json.JSONDecodeError, FileNotFoundError, ValueError) as e:
            raise Exception(f"Failed to load trace: {e}")

    def create_temp_extension(self):
        """Create a temporary extension directory with manifest and scripts."""
        self.temp_dir = tempfile.mkdtemp(prefix="js_replayer_")
        temp_path = Path(self.temp_dir)
        
        self.log(f"Creating temporary extension in: {self.temp_dir}")
        
        # Copy replayer.js to temp directory
        replayer_source = Path(__file__).parent / "replayer.js"
        if not replayer_source.exists():
            raise Exception("replayer.js not found. Make sure it exists in the same directory.")
        
        shutil.copy2(replayer_source, temp_path / "replayer.js")
        
        # Create manifest.json for the temporary extension
        manifest = {
            "manifest_version": 3,
            "name": "JS Trace Replayer",
            "version": "1.0",
            "description": "JavaScript-based trace replayer",
            "permissions": [
                "activeTab",
                "tabs",
                "scripting"
            ],
            "content_scripts": [
                {
                    "matches": ["<all_urls>"],
                    "js": ["replayer.js"],
                    "run_at": "document_start",
                    "all_frames": True
                }
            ],
            "background": {
                "service_worker": "background.js"
            }
        }
        
        with open(temp_path / "manifest.json", 'w') as f:
            json.dump(manifest, f, indent=2)
        
        # Create background.js
        background_js = """
chrome.runtime.onInstalled.addListener(() => {
  console.log('JS Trace Replayer extension loaded');
});

// Handle messages from Python script via content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REPLAY_TRACE') {
    // Forward to content script
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message, sendResponse);
      }
    });
    return true; // Async response
  }
});
"""
        
        with open(temp_path / "background.js", 'w') as f:
            f.write(background_js)
        
        return self.temp_dir

    def cleanup_temp_extension(self):
        """Remove temporary extension directory."""
        if self.temp_dir and Path(self.temp_dir).exists():
            shutil.rmtree(self.temp_dir)
            self.log("Cleaned up temporary extension")

    def launch_chrome_with_extension(self):
        """Launch Chrome with the temporary extension loaded."""
        extension_dir = self.create_temp_extension()
        
        # Build Chrome command
        chrome_args = [
            # Try common Chrome locations
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" if sys.platform == "darwin" 
            else "google-chrome" if sys.platform.startswith("linux")
            else "chrome.exe",  # Windows
            
            f"--load-extension={extension_dir}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-default-apps",
            f"--user-data-dir={tempfile.mkdtemp(prefix='chrome_profile_')}"
        ]
        
        if self.incognito:
            chrome_args.append("--incognito")
        
        # Add the starting URL
        if self.trace and 'startUrl' in self.trace:
            chrome_args.append(self.trace['startUrl'])
        
        try:
            self.log(f"Launching Chrome with extension...")
            if self.verbose:
                self.log(f"Chrome command: {' '.join(chrome_args)}")
            
            # Launch Chrome
            process = subprocess.Popen(
                chrome_args,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            return process
            
        except FileNotFoundError:
            raise Exception("Chrome executable not found. Please install Google Chrome.")

    def wait_for_user_to_start_replay(self):
        """Wait for user to manually trigger replay in Chrome."""
        print("\n" + "="*60)
        print("JAVASCRIPT REPLAYER READY")
        print("="*60)
        print(f"Trace loaded: {len(self.trace['steps'])} steps")
        print(f"Starting URL: {self.trace.get('startUrl', 'N/A')}")
        print()
        print("INSTRUCTIONS:")
        print("1. Chrome should have opened with the extension loaded")
        print("2. Navigate to the starting URL if not already there")
        print("3. Open Chrome DevTools (F12)")
        print("4. Go to the Console tab")
        print("5. Run this command to start replay:")
        print()
        print("   window.actionReplayer.replay(")
        print(f"     {json.dumps(self.trace, indent=2)}")
        print("   );")
        print()
        print("6. Watch the replay execute!")
        print()
        print("Press Enter when replay is complete...")
        
        input()

    def run(self):
        """Main execution method."""
        try:
            # Load trace
            self.trace = self.load_trace()
            
            # Launch Chrome with extension
            chrome_process = self.launch_chrome_with_extension()
            
            # Wait for user to start replay
            self.wait_for_user_to_start_replay()
            
            self.log("Replay session completed")
            
        except KeyboardInterrupt:
            self.log("Interrupted by user")
        except Exception as e:
            print(f"Error: {e}")
            sys.exit(1)
        finally:
            self.cleanup_temp_extension()


def main():
    parser = argparse.ArgumentParser(description="Replay a trace using JavaScript execution")
    parser.add_argument("trace_file", help="Path to the trace JSON file")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")
    parser.add_argument("--incognito", action="store_true", help="Run Chrome in incognito mode")
    
    args = parser.parse_args()
    
    # Verify trace file exists
    trace_path = Path(args.trace_file)
    if not trace_path.exists():
        print(f"Error: Trace file not found: {args.trace_file}")
        sys.exit(1)
    
    # Create and run replayer
    replayer = JSTraceReplayer(
        trace_path=str(trace_path),
        verbose=args.verbose,
        incognito=args.incognito
    )
    
    try:
        replayer.run()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()