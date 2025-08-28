class ActionRecorder {
  constructor() {
    this.isRecording = false;
    this.startTime = 0;
    this.setupMessageListener();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'START_RECORDING':
          this.startRecording(message.resumed || false);
          sendResponse({ success: true });
          break;
        case 'STOP_RECORDING':
          this.stopRecording();
          sendResponse({ success: true });
          break;
      }
    });
  }

  startRecording(resumed = false) {
    if (this.isRecording && !resumed) return;

    this.isRecording = true;

    // Only reset start time if this is a new recording session
    if (!resumed) {
      this.startTime = Date.now();

      // Record initial navigation
      this.recordEvent({
        type: 'navigate',
        url: window.location.href,
        title: document.title
      });
    } else {
      // For resumed sessions, record the navigation to the new page
      this.recordEvent({
        type: 'navigate',
        url: window.location.href,
        title: document.title
      });
    }

    // Add event listeners
    document.addEventListener('click', this.handleClick.bind(this), true);
    document.addEventListener('input', this.handleInput.bind(this), true);
    document.addEventListener('keydown', this.handleKeydown.bind(this), true);

    console.log(`Content script: Recording ${resumed ? 'resumed' : 'started'} on ${window.location.href}`);
  }

  stopRecording() {
    if (!this.isRecording) return;

    this.isRecording = false;

    // Remove event listeners
    document.removeEventListener('click', this.handleClick.bind(this), true);
    document.removeEventListener('input', this.handleInput.bind(this), true);
    document.removeEventListener('keydown', this.handleKeydown.bind(this), true);

    console.log('Content script: Recording stopped');
  }

  getTimestamp() {
    return Date.now() - this.startTime;
  }

  recordEvent(eventData) {
    if (!this.isRecording) return;

    const event = {
      timestamp: this.getTimestamp(),
      ...eventData
    };

    // Send event to background script
    try {
      chrome.runtime.sendMessage({
        type: 'RECORD_EVENT',
        event: event
      });
    } catch (e) {
      console.error('Failed to send event to background:', e);
    }
  }

  generateSelectors(element) {
    const selectors = [];

    // ID selector (highest priority)
    if (element.id) {
      selectors.push({ type: 'id', value: `#${element.id}` });
    }

    // Class selector
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/);
      if (classes.length > 0) {
        selectors.push({ type: 'class', value: `.${classes.join('.')}` });
      }
    }

    // Text content for clickable elements
    if (this.isClickableElement(element)) {
      const text = element.textContent?.trim();
      if (text && text.length < 50) {
        selectors.push({ type: 'text', value: text });
      }
    }

    // CSS path as fallback
    selectors.push({ type: 'css', value: this.generateCSSPath(element) });

    return selectors;
  }

  isClickableElement(element) {
    const clickableTypes = ['button', 'a', 'input[type="button"]', 'input[type="submit"]'];
    const tagName = element.tagName.toLowerCase();
    const type = element.type?.toLowerCase();

    return clickableTypes.includes(tagName) ||
           (tagName === 'input' && ['button', 'submit'].includes(type)) ||
           element.onclick ||
           element.hasAttribute('onclick');
  }

  generateCSSPath(element) {
    const path = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      }

      // Add nth-child if needed for uniqueness
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children)
          .filter(child => child.tagName === current.tagName);

        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;

      // Limit path depth
      if (path.length >= 5) break;
    }

    return path.join(' > ');
  }

  handleClick(event) {
    const target = event.target;

    this.recordEvent({
      type: 'click',
      selectors: this.generateSelectors(target),
      x: event.clientX,
      y: event.clientY,
      button: event.button === 0 ? 'left' : event.button === 1 ? 'middle' : 'right'
    });
  }

  handleInput(event) {
    const target = event.target;

    // Skip password fields for security
    if (target.type === 'password') return;

    this.recordEvent({
      type: 'type',
      selectors: this.generateSelectors(target),
      text: target.value,
      inputType: target.type || 'text'
    });
  }

  handleKeydown(event) {
    // Only record special keys
    const specialKeys = ['Enter', 'Tab', 'Escape'];

    if (specialKeys.includes(event.key)) {
      this.recordEvent({
        type: 'keydown',
        key: event.key,
        selectors: this.generateSelectors(event.target)
      });
    }
  }
}

// Initialize recorder when script loads
if (!window.actionRecorder) {
  window.actionRecorder = new ActionRecorder();
}