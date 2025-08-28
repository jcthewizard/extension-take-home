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
    this.inputDebounces = new Map(); // element -> { timer, lastEmitTime }
    this.isComposing = false; // Track IME composition state
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
    document.addEventListener('change', this.handleChange.bind(this), true);
    document.addEventListener('submit', this.handleSubmit.bind(this), true);
    document.addEventListener('blur', this.handleBlur.bind(this), true);
    document.addEventListener('keyup', this.handleKeyUp.bind(this), true);
    document.addEventListener('keypress', this.handleKeyPress.bind(this), true);
    document.addEventListener('compositionstart', this.handleCompositionStart.bind(this), true);
    document.addEventListener('compositionend', this.handleCompositionEnd.bind(this), true);

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
    document.removeEventListener('change', this.handleChange.bind(this), true);
    document.removeEventListener('submit', this.handleSubmit.bind(this), true);
    document.removeEventListener('blur', this.handleBlur.bind(this), true);
    document.removeEventListener('keyup', this.handleKeyUp.bind(this), true);
    document.removeEventListener('keypress', this.handleKeyPress.bind(this), true);
    document.removeEventListener('compositionstart', this.handleCompositionStart.bind(this), true);
    document.removeEventListener('compositionend', this.handleCompositionEnd.bind(this), true);
    
    // Clear any pending hover timer
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    this.hoverCandidate = null;
    
    // Clear any pending input debounce timers
    this.inputDebounces.forEach(debounce => {
      if (debounce.timer) {
        clearTimeout(debounce.timer);
      }
    });
    this.inputDebounces.clear();

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

  isTextInput(element) {
    return element && (
      (element instanceof HTMLInputElement && 
        ['text', 'search', 'email', 'url', 'tel', 'number'].includes(element.type || 'text')) ||
      element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLElement && element.isContentEditable)
    );
  }

  emitTypeForElement(element, options = {}) {
    if (!this.isTextInput(element)) return;
    
    // Skip password fields for security
    if (element instanceof HTMLInputElement && element.type === 'password') return;

    const value = element instanceof HTMLElement && element.isContentEditable
      ? element.textContent
      : element.value;

    const step = {
      type: 'type',
      selectors: this.generateSelectors(element),
      text: String(value || ''),
      inputType: element.type || 'text'
    };

    if (options.submit) {
      step.submit = true;
    }

    this.recordEvent(step);
  }

  handleInput(event) {
    const target = event.target;
    
    if (!this.isTextInput(target)) return;
    
    // Skip password fields for security
    if (target instanceof HTMLInputElement && target.type === 'password') return;

    const now = this.getTimestamp();
    const debounceEntry = this.inputDebounces.get(target) || { timer: null, lastEmitTime: -Infinity };

    // Emit immediately if enough time has passed (33ms debounce like reference)
    if (now - debounceEntry.lastEmitTime >= 33) {
      debounceEntry.lastEmitTime = now;
      if (debounceEntry.timer) {
        clearTimeout(debounceEntry.timer);
        debounceEntry.timer = null;
      }
      this.emitTypeForElement(target);
    } else if (!debounceEntry.timer) {
      // Schedule delayed emit
      const waitTime = 33 - (now - debounceEntry.lastEmitTime);
      debounceEntry.timer = setTimeout(() => {
        debounceEntry.timer = null;
        debounceEntry.lastEmitTime = this.getTimestamp();
        this.emitTypeForElement(target);
      }, waitTime);
    }

    this.inputDebounces.set(target, debounceEntry);
  }

  getModifiers(event) {
    const modifiers = [];
    if (event.altKey) modifiers.push('Alt');
    if (event.ctrlKey) modifiers.push('Control');
    if (event.metaKey) modifiers.push('Meta');
    if (event.shiftKey) modifiers.push('Shift');
    return modifiers;
  }

  handleKeydown(event) {
    if (!this.isRecording) return;
    
    const key = event.key;
    const target = event.target;

    // Handle Enter key in form contexts first
    if (key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Check if this is a form submission trigger
      if (this.isTextInput(target)) {
        // Flush any pending debounced input first
        const debounceEntry = this.inputDebounces.get(target);
        if (debounceEntry?.timer) {
          clearTimeout(debounceEntry.timer);
          debounceEntry.timer = null;
        }
        this.inputDebounces.delete(target);
        
        // Find the form context
        const form = target.form || target.closest('form');
        if (form) {
          // Record form submission
          this.recordEvent({
            type: 'submit',
            formSelectors: this.generateSelectors(form),
            selectors: this.generateSelectors(target)
          });
        } else {
          // No form context, record as type with submit flag
          this.emitTypeForElement(target, { submit: true });
        }
        return; // Don't also record as keydown
      }
    }

    // Skip recording key events if we're in text input and composing
    if (this.isTextInput(target) && key === 'Enter') return;

    // Record key events for non-text inputs or special keys
    if (!this.isTextInput(target) || this.isSpecialKey(key)) {
      const modifiers = this.getModifiers(event);
      
      this.recordEvent({
        type: 'key',
        key: key,
        action: 'down',
        modifiers: modifiers,
        selectors: this.generateSelectors(target)
      });
    }

    // Suppress scroll recording for navigation keys that cause automatic scrolling
    const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Space', 'Spacebar']);
    if (scrollKeys.has(key)) {
      this.suppressScrollUntil = Date.now() + 400; // Suppress for 400ms
    }
  }

  isSpecialKey(key) {
    const specialKeys = new Set([
      'Enter', 'Tab', 'Escape', 'Backspace', 'Delete',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'PageUp', 'PageDown', 'Home', 'End',
      'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
    ]);
    return specialKeys.has(key);
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

  handleChange(event) {
    if (!this.isRecording) return;
    
    const target = event.target;
    
    // Handle select elements (single and multiple selection)
    if (target instanceof HTMLSelectElement) {
      const values = Array.from(target.selectedOptions).map(option => option.value);
      this.recordEvent({
        type: 'select',
        selectors: this.generateSelectors(target),
        value: target.multiple ? values : (values[0] || '')
      });
      return;
    }
    
    // Handle checkbox and radio button changes
    if (target instanceof HTMLInputElement && 
        (target.type === 'checkbox' || target.type === 'radio')) {
      this.recordEvent({
        type: 'change',
        selectors: this.generateSelectors(target),
        value: target.checked,
        inputType: target.type
      });
      return;
    }
  }

  handleSubmit(event) {
    if (!this.isRecording) return;
    
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    
    // Record form submission with submitter info if available
    const submitter = event.submitter && form.contains(event.submitter) ? event.submitter : null;
    
    const step = {
      type: 'submit',
      formSelectors: this.generateSelectors(form)
    };
    
    if (submitter) {
      step.submitterSelectors = this.generateSelectors(submitter);
    }
    
    this.recordEvent(step);
  }

  handleBlur(event) {
    if (!this.isRecording) return;
    
    const target = event.target;
    if (!this.isTextInput(target)) return;
    
    // Flush any pending input when element loses focus
    this.emitTypeForElement(target);
  }

  handleKeyUp(event) {
    if (!this.isRecording) return;

    const key = event.key;
    const target = event.target;

    // Skip if we're in text input (handled by input events)
    if (this.isTextInput(target) && !this.isSpecialKey(key)) return;

    // Record key up for special keys or non-text inputs
    if (!this.isTextInput(target) || this.isSpecialKey(key)) {
      const modifiers = this.getModifiers(event);
      
      this.recordEvent({
        type: 'key',
        key: key,
        action: 'up',
        modifiers: modifiers,
        selectors: this.generateSelectors(target)
      });
    }
  }

  handleKeyPress(event) {
    if (!this.isRecording) return;

    const key = event.key;
    const target = event.target;

    // Skip if we're in text input (handled by input events) 
    if (this.isTextInput(target)) return;

    // Record key press for non-text inputs only
    const modifiers = this.getModifiers(event);
    
    this.recordEvent({
      type: 'key',
      key: key,
      action: 'press',
      modifiers: modifiers,
      selectors: this.generateSelectors(target)
    });
  }

  handleCompositionStart(event) {
    if (!this.isRecording) return;
    
    this.isComposing = true;
    
    this.recordEvent({
      type: 'composition',
      action: 'start',
      data: event.data || '',
      selectors: this.generateSelectors(event.target)
    });
  }

  handleCompositionEnd(event) {
    if (!this.isRecording) return;
    
    this.isComposing = false;
    
    this.recordEvent({
      type: 'composition',
      action: 'end',
      data: event.data || '',
      selectors: this.generateSelectors(event.target)
    });
  }
}

// Initialize recorder when script loads
if (!window.actionRecorder) {
  window.actionRecorder = new ActionRecorder();
}