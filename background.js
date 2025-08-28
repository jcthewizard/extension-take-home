class RecordingManager {
  constructor() {
    this.isRecording = false;
    this.currentSession = null;
    this.recordedEvents = [];
    this.setupMessageHandlers();
    this.setupNavigationListeners();
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });
  }

  setupNavigationListeners() {
    // Listen for tab updates (navigation, page loads)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (this.isRecording &&
          this.currentSession?.tabId === tabId &&
          changeInfo.status === 'complete' &&
          tab.url &&
          !tab.url.startsWith('chrome://') &&
          !tab.url.startsWith('chrome-extension://')) {

        console.log('Tab navigation detected, re-injecting content script:', tab.url);

        // Re-inject content script and resume recording
        this.reinjectContentScript(tabId, tab.url);
      }
    });

        // Note: chrome.tabs.onNavigation is not available in Manifest V3
    // We rely on chrome.tabs.onUpdated for navigation detection
  }

  async reinjectContentScript(tabId, url) {
    try {
      // Wait a bit for the page to fully load
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Re-inject the content script
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });

      // Tell the content script to resume recording
      await chrome.tabs.sendMessage(tabId, {
        type: 'START_RECORDING',
        resumed: true,
        url: url
      });

      console.log('Content script re-injected and recording resumed on:', url);
    } catch (error) {
      console.error('Failed to re-inject content script:', error);
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'START_RECORDING':
          const startResult = await this.startRecording();
          sendResponse(startResult);
          break;

        case 'STOP_RECORDING':
          const stopResult = await this.stopRecording();
          sendResponse(stopResult);
          break;

        case 'GET_STATUS':
          sendResponse({
            success: true,
            isRecording: this.isRecording,
            eventCount: this.recordedEvents.length
          });
          break;

        case 'RECORD_EVENT':
          if (this.isRecording && message.event) {
            this.recordedEvents.push(message.event);
          }
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Background script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async startRecording() {
    if (this.isRecording) {
      return { success: false, error: 'Recording already in progress' };
    }

    try {
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url) {
        return { success: false, error: 'No active tab found' };
      }

      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        return { success: false, error: 'Cannot record on browser internal pages' };
      }

      this.isRecording = true;
      this.recordedEvents = [];
      this.currentSession = {
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        startTime: Date.now()
      };

      // Tell content script to start recording
      await chrome.tabs.sendMessage(tab.id, { type: 'START_RECORDING' });

      console.log('Recording started on tab:', tab.url);
      return { success: true };

    } catch (error) {
      console.error('Error starting recording:', error);
      return { success: false, error: error.message };
    }
  }

  async stopRecording() {
    if (!this.isRecording) {
      return { success: false, error: 'No recording in progress' };
    }

    try {
      // Tell content script to stop recording
      if (this.currentSession?.tabId) {
        await chrome.tabs.sendMessage(this.currentSession.tabId, { type: 'STOP_RECORDING' }).catch(() => {});
      }

      const trace = this.createTrace();
      const downloadResult = await this.downloadTrace(trace);

      const eventCount = this.recordedEvents.length;

      // Reset state
      this.isRecording = false;
      this.currentSession = null;
      this.recordedEvents = [];

      console.log(`Recording stopped. Captured ${eventCount} events.`);

      return {
        success: true,
        eventCount: eventCount,
        filename: downloadResult.filename
      };

    } catch (error) {
      console.error('Error stopping recording:', error);
      return { success: false, error: error.message };
    }
  }

  createTrace() {
    const now = new Date().toISOString();

    return {
      version: '1.0',
      createdAt: now,
      startUrl: this.currentSession.url,
      startTitle: this.currentSession.title,
      metadata: {
        userAgent: navigator.userAgent,
        extension: 'DevTools Recorder v1.0'
      },
      steps: this.recordedEvents.map(event => ({
        type: event.type,
        timestamp: event.timestamp,
        ...event
      }))
    };
  }

  async downloadTrace(trace) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `recording-${timestamp}.json`;
    const jsonData = JSON.stringify(trace, null, 2);
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonData);

    return new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve({ downloadId, filename });
        }
      });
    });
  }
}

// Initialize the recording manager
new RecordingManager();