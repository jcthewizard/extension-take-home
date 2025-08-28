# Chrome DevTools Recorder

A Chrome extension that records user interactions and replays them.

## Components

1. **Chrome Extension** - Records user actions and replays traces directly in-browser
2. **JavaScript Replayer** - In-page replay system to avoid automation detection
3. **Python Replay Scripts** - Multiple Playwright-based replay options
4. **Demo Traces** - ChatGPT conversation, frl website exploration, tour of my personal website

## Project Structure

```
extension-take-home/
├── README.md              # This file
├── requirements.txt       # Python dependencies
├── manifest.json         # Extension manifest
├── content.js            # Records user actions + integrated replayer
├── background.js         # Manages recordings and replay coordination
├── popup.html            # Extension UI with replay controls
├── popup.js              # UI logic for recording and replay
├── replay.py             # Python Playwright replay script
├── js_replay.py          # Chrome extension launcher for JS replay
├── simple_js_replay.py   # Console command generator
├── replayer.js           # Standalone JavaScript replayer
└── test-traces/          # Demo trace files
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
2. Click "Start Recording" to begin recording
3. Interact with the current webpage
4. Click "Stop Recording" to save the trace

Traces are automatically downloaded as JSON files.

### Replaying

#### Option 1: Integrated Extension Replay (buggy)

1. Click the extension icon in Chrome
2. Navigate to your target webpage
3. Click "Choose trace file" and select a JSON trace
4. Click "Start Replay" to execute
5. Watch the console (F12) for detailed progress logs

**Benefits:**
- No automation fingerprints (avoids bot detection)
- Integrated UI with progress tracking
- Real-time visual feedback
- Optimized typing speed and timing

#### Option 2: Python Playwright Replay

```bash
# Basic replay
python replay.py path/to/recording.json

# Verbose output
python replay.py -v path/to/recording.json

# Headless mode
python replay.py --headless path/to/recording.json

# Incognito mode
python replay.py --incognito path/to/recording.json
```

#### Option 3: Manual JavaScript Console

```bash
# Generate console commands
python simple_js_replay.py path/to/recording.json
```

Then copy/paste the generated JavaScript into browser console.

## Features

### Recording Capabilities
- **Comprehensive Event Tracking**: Clicks, typing, navigation, scrolling, hover, drag operations, and form interactions
- **Smart Element Selection**: Multiple selector strategies (CSS, XPath, ARIA, text content, data attributes)
- **Timing Preservation**: Natural human-like timing patterns and delays
- **Cross-Page Support**: Handles navigation and page transitions
- **Shadow DOM Support**: Works with modern web components

### Anti-Bot Detection Features
- **Stealth Mode**: JavaScript replayer avoids automation fingerprints
- **Natural Timing**: Human-like delays and interaction patterns
- **Incremental Typing**: Realistic character-by-character input simulation
- **Input Guards**: Prevents user interference during replay
- **Smart Navigation**: Skips unnecessary page reloads

### User Interface
- **Integrated Replay Controls**: File picker and replay buttons in extension popup
- **Real-Time Status Updates**: Live progress tracking during recording/replay
- **Console Logging**: Detailed execution logs for debugging
- **Professional Design**: Clean, intuitive interface

## To FRL

At the 2-hour mark, I had an extension that accurately records user interactions on web pages (clicks, typing, scrolling, navigation) and saves them as JSON trace files. It can then replay those interactions in multiple ways: through an integrated JavaScript replayer that runs directly in the browser to avoid bot detection, or via Python.The system is designed to circumvent anti-bot measures by using natural timing patterns and stealth techniques, making
it useful for automating web workflows while appearing as genuine human activity. Despite this, the largest challenge I faced (and still face) are the cloudflare popups/captchas that appear on chatgpt that I wasn't able to bypass in the alotted time. There were other anti-bot popups that I had to work around with strategies such as the aforementioned timing patterns, stealth mode, and the addition of the incognito flag.
