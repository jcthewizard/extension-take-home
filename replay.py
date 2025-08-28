#!/usr/bin/env python3
"""
Chrome DevTools Recorder - Replay Script
Replays recorded traces using Playwright
"""

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
except ImportError:
    print("Please install Playwright: pip install playwright")
    print("Then install browsers: playwright install")
    sys.exit(1)


class TraceReplayer:
    def __init__(self, trace_path: str, headless: bool = False, verbose: bool = False):
        self.trace_path = trace_path
        self.headless = headless
        self.verbose = verbose
        self.trace = None
        self.page = None
        self.browser = None

    def load_trace(self) -> Dict[str, Any]:
        """Load and validate the trace file."""
        try:
            with open(self.trace_path, 'r', encoding='utf-8') as f:
                trace = json.load(f)

            if not isinstance(trace, dict):
                raise ValueError("Trace must be a JSON object")

            if 'steps' not in trace or not isinstance(trace['steps'], list):
                raise ValueError("Trace must contain a 'steps' array")

            return trace
        except FileNotFoundError:
            raise FileNotFoundError(f"Trace file not found: {self.trace_path}")
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in trace file: {e}")

    def log(self, message: str):
        """Log message if verbose mode is enabled."""
        if self.verbose:
            print(f"[REPLAY] {message}")

    def find_element_by_selectors(self, selectors: List[Dict[str, str]], timeout: int = 5000) -> Any:
        """Find element using the selector strategies from the trace."""
        if not selectors:
            return None

        for selector in selectors:
            try:
                selector_type = selector.get('type')
                value = selector.get('value')

                if not value:
                    continue

                if selector_type == 'id':
                    return self.page.wait_for_selector(value, timeout=timeout)
                elif selector_type == 'class':
                    return self.page.wait_for_selector(value, timeout=timeout)
                elif selector_type == 'css':
                    return self.page.wait_for_selector(value, timeout=timeout)
                elif selector_type == 'text':
                    # Find by text content
                    return self.page.get_by_text(value, exact=False).first

            except PlaywrightTimeout:
                continue
            except Exception as e:
                self.log(f"Error with selector {selector}: {e}")
                continue

        return None

    def replay_navigate(self, step: Dict[str, Any]):
        """Replay navigation step."""
        url = step.get('url')
        if not url:
            self.log("Navigate step missing URL")
            return

        self.log(f"Navigating to: {url}")
        try:
            self.page.goto(url, wait_until='domcontentloaded', timeout=30000)
            # Give the page time to load
            self.page.wait_for_load_state('networkidle', timeout=10000)
        except PlaywrightTimeout:
            self.log("Navigation timeout, continuing anyway")
        except Exception as e:
            self.log(f"Navigation error: {e}")

    def replay_click(self, step: Dict[str, Any]):
        """Replay click step."""
        selectors = step.get('selectors', [])
        element = self.find_element_by_selectors(selectors)

        if not element:
            self.log(f"Could not find element for click: {selectors}")
            return

        try:
            self.log(f"Clicking element")
            element.click()

        except Exception as e:
            self.log(f"Click error: {e}")

    def replay_type(self, step: Dict[str, Any]):
        """Replay typing step."""
        selectors = step.get('selectors', [])
        text = step.get('text', '')

        element = self.find_element_by_selectors(selectors)

        if not element:
            self.log(f"Could not find element for type: {selectors}")
            return

        try:
            # Clear existing content and type new text
            element.click()  # Focus the element
            element.fill(text)  # This clears and types
            self.log(f"Typed: '{text[:50]}{'...' if len(text) > 50 else ''}'")

        except Exception as e:
            self.log(f"Type error: {e}")

    def replay_keydown(self, step: Dict[str, Any]):
        """Replay key press step."""
        key = step.get('key')

        if not key:
            return

        try:
            # Press the key
            self.page.keyboard.press(key)
            self.log(f"Pressed key: {key}")

        except Exception as e:
            self.log(f"Key press error: {e}")

    def replay_step(self, step: Dict[str, Any]):
        """Replay a single step."""
        step_type = step.get('type')

        if step_type == 'navigate':
            self.replay_navigate(step)
        elif step_type == 'click':
            self.replay_click(step)
        elif step_type == 'type':
            self.replay_type(step)
        elif step_type == 'keydown':
            self.replay_keydown(step)
        else:
            self.log(f"Unknown step type: {step_type}")

    def run(self):
        """Run the replay."""
        # Load trace
        self.trace = self.load_trace()
        self.log(f"Loaded trace with {len(self.trace['steps'])} steps")

        # Start Playwright
        with sync_playwright() as p:
            self.browser = p.chromium.launch(headless=self.headless)
            context = self.browser.new_context()
            self.page = context.new_page()

            try:
                # Get the start URL
                start_url = self.trace.get('startUrl')
                if start_url:
                    self.log(f"Starting at URL: {start_url}")
                    self.page.goto(start_url, wait_until='domcontentloaded')

                steps = self.trace['steps']
                total_steps = len(steps)

                # Replay each step
                for i, step in enumerate(steps, 1):
                    self.log(f"Step {i}/{total_steps}: {step.get('type', 'unknown')}")

                    # Calculate timing
                    timestamp = step.get('timestamp', 0)
                    if i > 1 and timestamp > 0:
                        # Get previous step timestamp
                        prev_timestamp = steps[i-2].get('timestamp', 0)
                        delay = (timestamp - prev_timestamp) / 1000.0  # Convert to seconds

                        # Cap delay at reasonable maximum
                        delay = min(delay, 2.0)
                        if delay > 0:
                            time.sleep(delay)

                    self.replay_step(step)

                self.log("Replay completed successfully!")

                if not self.headless:
                    print("Replay finished. Press Enter to close browser...")
                    input()

            except KeyboardInterrupt:
                self.log("Replay interrupted by user")
            except Exception as e:
                self.log(f"Replay error: {e}")
                raise
            finally:
                if self.browser:
                    self.browser.close()


def main():
    parser = argparse.ArgumentParser(description="Replay a recorded trace")
    parser.add_argument("trace_file", help="Path to the trace JSON file")
    parser.add_argument("--headless", action="store_true", help="Run in headless mode")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")

    args = parser.parse_args()

    # Verify trace file exists
    trace_path = Path(args.trace_file)
    if not trace_path.exists():
        print(f"Error: Trace file not found: {args.trace_file}")
        sys.exit(1)

    # Create and run replayer
    replayer = TraceReplayer(
        trace_path=str(trace_path),
        headless=args.headless,
        verbose=args.verbose
    )

    try:
        replayer.run()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()