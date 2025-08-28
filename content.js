class ActionRecorder {
  constructor() {
    this.isRecording = false;
    this.startTime = 0;
    this.hoverTimer = null;
    this.hoverCandidate = null;
    this.lastWindowScrollAt = 0;
    this.suppressScrollUntil = 0;
    this.dragStart = null;
    this.suppressClickUntil = 0;
    this.lastDragSampleAt = 0;
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
    document.addEventListener('mousedown', this.handleMouseDown.bind(this), true);
    document.addEventListener('mousemove', this.handleMouseMove.bind(this), true);
    document.addEventListener('mouseup', this.handleMouseUp.bind(this), true);

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
    document.removeEventListener('mousedown', this.handleMouseDown.bind(this), true);
    document.removeEventListener('mousemove', this.handleMouseMove.bind(this), true);
    document.removeEventListener('mouseup', this.handleMouseUp.bind(this), true);
    
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

    if (!element || !element.tagName) return selectors;

    // ID selector (highest priority)
    if (element.id) {
      selectors.push({ type: 'css', value: `#${this.cssEscape(element.id)}` });
    }

    // Data-testid selector (very high priority for testing)
    const testid = element.getAttribute('data-testid');
    if (testid) {
      const escaped = this.cssEscape(testid);
      selectors.push({ type: 'css', value: `[data-testid="${escaped}"]` });
      selectors.push({ type: 'xpath', value: `//*[@data-testid="${escaped}"]` });
    }

    // Name attribute selector
    const name = element.getAttribute('name');
    if (name) {
      selectors.push({
        type: 'css',
        value: `${element.tagName.toLowerCase()}[name="${this.cssEscape(name)}"]`
      });
    }

    // ARIA selector (aria-label, aria-labelledby)
    const ariaName = this.getAriaName(element);
    if (ariaName) {
      selectors.push({ type: 'aria', value: ariaName });
    }

    // Class selector
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/);
      if (classes.length > 0) {
        selectors.push({ type: 'css', value: `.${classes.join('.')}` });
      }
    }

    // CSS path as fallback
    selectors.push({ type: 'css', value: this.generateCSSPath(element) });

    // Text content (with length limit)
    const text = element.textContent?.trim();
    if (text && text.length > 0 && text.length <= 80) {
      selectors.push({ type: 'text', value: text.slice(0, 80) });
    }

    return selectors;
  }

  cssEscape(string) {
    // Use native CSS.escape if available, otherwise fallback
    if (window.CSS && CSS.escape) {
      return CSS.escape(string);
    }
    // Fallback CSS escaping
    return String(string).replace(/([ #;?%&,.+*~\':"!^$\[\]()=>|\/])/g, '\\$1');
  }

  getAriaName(element) {
    if (!element) return null;

    // Try aria-label first
    const label = element.getAttribute('aria-label');
    if (label && label.trim()) return label.trim();

    // Try aria-labelledby
    const labelledby = element.getAttribute('aria-labelledby');
    if (labelledby) {
      const parts = labelledby.split(/\s+/)
        .map(id => document.getElementById(id))
        .filter(Boolean);
      const text = parts
        .map(node => node && node.textContent ? node.textContent : '')
        .join(' ')
        .trim();
      if (text) return text;
    }

    // Try title attribute
    const title = element.getAttribute('title');
    if (title && title.trim()) return title.trim();

    return null;
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
    let depth = 0;

    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 5) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = `#${this.cssEscape(current.id)}`;
        path.unshift(selector);
        break;
      }

      // Check for data-testid (high priority)
      const testid = current.getAttribute('data-testid');
      if (testid) {
        selector = `[data-testid="${this.cssEscape(testid)}"]`;
        path.unshift(selector);
        break;
      }

      // Check for name attribute
      const name = current.getAttribute('name');
      if (name) {
        selector = `${current.tagName.toLowerCase()}[name="${this.cssEscape(name)}"]`;
        path.unshift(selector);
        break;
      }

      // Use nth-of-type instead of nth-child for more stability
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children)
          .filter(child => child.tagName === current.tagName);

        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector = `${current.tagName.toLowerCase()}:nth-of-type(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
      depth++;
    }

    return path.join(' > ');
  }

  handleClick(event) {
    // Skip recording clicks that were generated by drag operations
    // But allow the normal browser behavior to proceed
    if (Date.now() < this.suppressClickUntil) {
      return; // Don't record, but let the click work normally
    }

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
      const type = current.getAttribute('type')?.toLowerCase();
      const interactiveRoles = new Set(['button','menuitem','menuitemcheckbox','menuitemradio','option','tab','link']);
      
      // Check if element is inherently interactive
      const isButtonish = tagName === 'button' || 
                         (tagName === 'a' && current.hasAttribute('href')) || 
                         (tagName === 'input' && ['button','submit','image','checkbox','radio'].includes(type || '')) ||
                         tagName === 'select' ||
                         tagName === 'textarea' ||
                         (role && interactiveRoles.has(role)) ||
                         current.hasAttribute('data-testid') ||
                         current.contentEditable === 'true';
      
      // Check for event handlers
      const hasHandler = !!(current.onclick || 
                            current.onmousedown || 
                            current.onpointerdown || 
                            current.getAttribute('onclick') ||
                            current.getAttribute('onmousedown') ||
                            current.getAttribute('onpointerdown'));
      
      // Check for cursor pointer (often indicates clickable)
      const hasPointerCursor = window.getComputedStyle(current).cursor === 'pointer';
      
      if (isButtonish || hasHandler || hasPointerCursor) {
        return current;
      }
      
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

  handleMouseDown(event) {
    if (!this.isRecording) return;
    
    // Only track left mouse button for drags
    if (event.button !== 0) return;
    
    // Start tracking potential drag
    this.dragStart = {
      element: event.target,
      clientX: event.clientX,
      clientY: event.clientY,
      timestamp: this.getTimestamp(),
      button: 'left',
      path: [],
      maxDistance: 0
    };
  }

  handleMouseMove(event) {
    if (!this.isRecording || !this.dragStart) return;
    
    const now = this.getTimestamp();
    
    // Sample drag path at 16ms intervals (like reference implementation)
    if (now - this.lastDragSampleAt < 16) return;
    
    this.lastDragSampleAt = now;
    
    // Add point to drag path
    this.dragStart.path.push({
      x: event.clientX,
      y: event.clientY,
      dt: now - this.dragStart.timestamp
    });
    
    // Track maximum distance from start point
    const dx = event.clientX - this.dragStart.clientX;
    const dy = event.clientY - this.dragStart.clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > this.dragStart.maxDistance) {
      this.dragStart.maxDistance = distance;
    }
  }

  handleMouseUp(event) {
    if (!this.isRecording) return;
    
    if (!this.dragStart) {
      // No drag in progress, handle as normal click would be handled elsewhere
      return;
    }
    
    // Calculate final distance moved
    const dx = event.clientX - this.dragStart.clientX;
    const dy = event.clientY - this.dragStart.clientY;
    const finalDistance = Math.sqrt(dx * dx + dy * dy);
    
    // Consider as drag if moved more than 5px (threshold like reference)
    const isDrag = finalDistance > 5 || this.dragStart.maxDistance > 5;
    
    if (isDrag) {
      // Record as drag event
      const startEl = this.dragStart.element;
      const startRect = startEl.getBoundingClientRect();
      
      this.recordEvent({
        type: 'drag',
        selectors: this.generateSelectors(startEl),
        from: {
          x: Math.round(this.dragStart.clientX - startRect.left),
          y: Math.round(this.dragStart.clientY - startRect.top)
        },
        to: {
          x: event.clientX,
          y: event.clientY
        },
        path: this.dragStart.path.length > 0 ? this.dragStart.path.slice() : undefined,
        targetSelectors: this.generateSelectors(event.target),
        button: this.dragStart.button
      });
      
      // Suppress click events for 400ms after drag
      this.suppressClickUntil = Date.now() + 400;
    } else {
      // Record as click instead (small movement, treat as click)
      const element = this.getNearestClickableElement(event.target);
      const rect = element.getBoundingClientRect();
      
      this.recordEvent({
        type: 'click',
        selectors: this.generateSelectors(element),
        x: Math.round(event.clientX - rect.left),
        y: Math.round(event.clientY - rect.top),
        button: 'left'
      });
      
      // Brief click suppression to avoid duplicate clicks
      this.suppressClickUntil = Date.now() + 200;
    }
    
    // Reset drag tracking
    this.dragStart = null;
    this.lastDragSampleAt = 0;
  }
}

// Initialize recorder when script loads
if (!window.actionRecorder) {
  window.actionRecorder = new ActionRecorder();
}