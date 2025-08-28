# Chrome DevTools Recorder

A Chrome extension that records user interactions and replays them using Python + Playwright.

## Components

1. **Chrome Extension** - Records user actions in the browser
2. **Python Replay Script** - Replays recorded traces using Playwright
3. **Demo Traces** - ChatGPT conversation recordings

## Project Structure

```
extension-take-home/
├── README.md              # This file
├── requirements.txt       # Python dependencies
├── replay.py             # Python replay script
├── manifest.json         # Extension manifest
├── content.js            # Records user actions
├── background.js         # Manages recordings
├── popup.html            # Extension UI
├── popup.js              # UI logic
└── traces/               # Demo trace files
```

## Installation

### Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select this directory
4. The extension icon should appear in your toolbar

### Python Requirements

```bash
pip install -r requirements.txt
playwright install chromium
```

## Usage

### Recording

1. Click the extension icon in Chrome
2. Click "Start" to begin recording
3. Interact with the current webpage
4. Click "Stop" to save the trace

Traces are automatically saved to `~/Downloads/traces/`

### Replaying

```bash
# Basic replay
python replay.py ~/Downloads/traces/recording-*.json

# Verbose output
python replay.py -v ~/Downloads/traces/recording-*.json

# Headless mode
python replay.py --headless ~/Downloads/traces/recording-*.json
```

## Features

- Records clicks, typing, navigation, scrolling, and drag operations
- Multiple element detection strategies for robust replay
- Real-time recording feedback
- Professional UI design
- Cross-page navigation support

## ChatGPT Demo

The included demo trace shows:
- Navigation to chatgpt.com
- Multi-round conversation
- Search mode usage
- Complete interaction flow

---

## Original Assignment

### Problem
Implementing a version of the [Chrome DevTools Recorder](https://developer.chrome.com/docs/devtools/recorder). 

### Required Components:
1) Chrome extension that captures user actions and downloads traces
2) Script that replays recorded traces on a browser
3) Recorded trace of ChatGPT conversation with Search mode

### Implementation Notes
Uses HTML selectors for element detection with multiple fallback strategies for robustness. 
