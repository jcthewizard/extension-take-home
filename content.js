class ActionRecorder {
  constructor() {
    this.isRecording = false;
    this.startTime = 0;
    this.hoverTimer = null;
    this.hoverCandidate = null;
    this.lastWindowScrollAt = 0;
    this.suppressScrollUntil = 0;
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

    // Check if we're on a bot detection page
    if (this.isBotDetectionPage()) {
      console.log('Content script: Bot detection page detected, pausing recording');
      this.setupDetectionPageWatcher();
      return;
    }

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
    document.addEventListener('mouseover', this.handleMouseOver.bind(this), true);
    document.addEventListener('mouseout', this.handleMouseOut.bind(this), true);
    window.addEventListener('scroll', this.handleWindowScroll.bind(this), true);
    document.addEventListener('scroll', this.handleElementScroll.bind(this), true);

    console.log(`Content script: Recording ${resumed ? 'resumed' : 'started'} on ${window.location.href}`);
  }

  stopRecording() {
    if (!this.isRecording) return;

    this.isRecording = false;

    // Remove event listeners
    document.removeEventListener('click', this.handleClick.bind(this), true);
    document.removeEventListener('input', this.handleInput.bind(this), true);
    document.removeEventListener('keydown', this.handleKeydown.bind(this), true);
    document.removeEventListener('mouseover', this.handleMouseOver.bind(this), true);
    document.removeEventListener('mouseout', this.handleMouseOut.bind(this), true);
    window.removeEventListener('scroll', this.handleWindowScroll.bind(this), true);
    document.removeEventListener('scroll', this.handleElementScroll.bind(this), true);
    
    // Clear any pending hover timer
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    this.hoverCandidate = null;

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

    // Suppress scroll recording for navigation keys that cause automatic scrolling
    const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Space', 'Spacebar']);
    if (scrollKeys.has(event.key)) {
      this.suppressScrollUntil = Date.now() + 400; // Suppress for 400ms
    }
  }

  getNearestClickableElement(element) {
    let current = element;
    while (current && current !== document.documentElement) {
      if (!(current instanceof Element)) break;
      
      const tagName = current.tagName.toLowerCase();
      const role = current.getAttribute('role');
      const interactiveRoles = new Set(['button','menuitem','menuitemcheckbox','menuitemradio','option','tab','link']);
      
      const isButtonish = tagName === 'button' || 
                         (tagName === 'a' && current.hasAttribute('href')) || 
                         (tagName === 'input' && ['button','submit','image'].includes(current.getAttribute('type')||'')) || 
                         (role && interactiveRoles.has(role)) || 
                         current.hasAttribute('data-testid');
      
      const hasHandler = !!(current.onclick || current.onmousedown || current.onpointerdown || current.getAttribute('onclick'));
      
      if (isButtonish || hasHandler) return current;
      current = current.parentElement;
    }
    return element;
  }

  scheduleHover(element, clientX, clientY) {
    // Clear any existing hover timer
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }

    this.hoverCandidate = element;
    
    // Schedule hover event after 200ms dwell time
    this.hoverTimer = setTimeout(() => {
      this.hoverTimer = null;
      if (!this.hoverCandidate || !this.isRecording) return;

      const rect = this.hoverCandidate.getBoundingClientRect();
      const step = {
        type: 'hover',
        selectors: this.generateSelectors(this.hoverCandidate),
        x: Math.round(clientX - rect.left),
        y: Math.round(clientY - rect.top),
        timestamp: this.getTimestamp()
      };
      
      this.recordEvent(step);
    }, 200); // 200ms dwell time like reference implementation
  }

  handleMouseOver(event) {
    if (!this.isRecording) return;
    
    const element = this.getNearestClickableElement(event.target);
    this.scheduleHover(element, event.clientX, event.clientY);
  }

  handleMouseOut() {
    // Clear hover timer when mouse leaves
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    this.hoverCandidate = null;
  }

  handleWindowScroll() {
    if (!this.isRecording) return;
    
    // Skip if scroll is suppressed (from keyboard navigation)
    if (Date.now() < this.suppressScrollUntil) return;
    
    // Throttle scroll events to prevent spam (300ms intervals like reference)
    const now = performance.now();
    if (now - this.lastWindowScrollAt < 300) return;
    
    this.lastWindowScrollAt = now;
    
    this.recordEvent({
      type: 'scroll',
      target: 'window',
      x: window.scrollX,
      y: window.scrollY
    });
  }

  handleElementScroll(event) {
    if (!this.isRecording) return;
    
    const target = event.target;
    
    // Skip if this is the window/document (handled by handleWindowScroll)
    if (target === window || target === document || target === document.documentElement || target === document.body) {
      return;
    }
    
    // Only track scrollable elements (overflow: auto, scroll, or scrollable content)
    const computedStyle = window.getComputedStyle(target);
    const isScrollable = computedStyle.overflow === 'auto' || 
                        computedStyle.overflow === 'scroll' ||
                        computedStyle.overflowY === 'auto' ||
                        computedStyle.overflowY === 'scroll' ||
                        computedStyle.overflowX === 'auto' ||
                        computedStyle.overflowX === 'scroll';
    
    if (!isScrollable) return;
    
    this.recordEvent({
      type: 'scroll',
      target: 'element',
      x: target.scrollLeft,
      y: target.scrollTop,
      selectors: this.generateSelectors(target)
    });
  }

  isBotDetectionPage() {
    // Check for common bot detection page indicators
    const url = window.location.href;
    const title = document.title.toLowerCase();
    const bodyText = document.body ? document.body.textContent.toLowerCase() : '';
    
    // Google's bot detection page
    if (url.includes('google.com') && 
        (bodyText.includes('unusual traffic') || 
         bodyText.includes('not a robot') ||
         bodyText.includes('verify you are human') ||
         title.includes('unusual traffic'))) {
      return true;
    }
    
    // Cloudflare protection
    if (bodyText.includes('checking your browser') || 
        bodyText.includes('cloudflare') ||
        title.includes('just a moment')) {
      return true;
    }
    
    // Generic captcha/verification pages
    if (bodyText.includes('captcha') || 
        bodyText.includes('verification') ||
        bodyText.includes('prove you are human')) {
      return true;
    }
    
    return false;
  }

  setupDetectionPageWatcher() {
    // Watch for page changes that indicate we've passed the detection
    const observer = new MutationObserver(() => {
      if (!this.isBotDetectionPage()) {
        console.log('Content script: Detection page cleared, resuming recording');
        observer.disconnect();
        this.startRecording(true); // Resume recording
      }
    });
    
    observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: true 
    });
    
    // Also check URL changes
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    const checkAndResume = () => {
      if (!this.isBotDetectionPage()) {
        console.log('Content script: URL changed, detection cleared, resuming recording');
        this.startRecording(true);
      }
    };
    
    history.pushState = function(...args) {
      const result = originalPushState.apply(this, args);
      setTimeout(checkAndResume, 100);
      return result;
    };
    
    history.replaceState = function(...args) {
      const result = originalReplaceState.apply(this, args);
      setTimeout(checkAndResume, 100);
      return result;
    };
  }
}

// Initialize recorder when script loads
if (!window.actionRecorder) {
  window.actionRecorder = new ActionRecorder();
}