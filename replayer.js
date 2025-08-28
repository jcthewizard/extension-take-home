/* JavaScript Replayer - Executes traces in-page without automation fingerprints */

class ActionReplayer {
  constructor() {
    this.isReplaying = false;
    this.trace = null;
    this.currentStep = 0;
    this.startTime = 0;
    this.speed = 1.0; // Playback speed multiplier
    this.inputGuard = null;
    this.debug = true;
  }

  log(message) {
    if (this.debug) {
      console.log(`[REPLAYER] ${message}`);
    }
  }

  // Input Guard System - Prevents real user input during replay
  createInputGuard() {
    this.log('Creating input guard to block user input');
    
    // Create transparent overlay to block interactions
    const overlay = document.createElement('div');
    overlay.id = 'altera-input-guard';
    overlay.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      background: rgba(255,0,0,0.1) !important;
      pointer-events: auto !important;
      cursor: not-allowed !important;
    `;

    // Block all user events
    const blockEvent = (e) => {
      if (e.isTrusted) { // Only block real user events, not synthetic ones
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    };

    // Block mouse events
    ['mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu'].forEach(type => {
      overlay.addEventListener(type, blockEvent, { capture: true, passive: false });
    });

    // Block keyboard events
    ['keydown', 'keyup', 'keypress'].forEach(type => {
      document.addEventListener(type, blockEvent, { capture: true, passive: false });
    });

    // Block touch events
    ['touchstart', 'touchend', 'touchmove'].forEach(type => {
      overlay.addEventListener(type, blockEvent, { capture: true, passive: false });
    });

    document.body.appendChild(overlay);
    return overlay;
  }

  removeInputGuard() {
    if (this.inputGuard) {
      this.log('Removing input guard');
      this.inputGuard.remove();
      this.inputGuard = null;
    }
  }

  // Get all document roots including shadow DOMs
  getAllDocumentRoots() {
    const roots = [document];
    
    // Find all shadow roots
    const walker = document.createTreeWalker(
      document,
      NodeFilter.SHOW_ELEMENT,
      null,
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      if (node.shadowRoot) {
        roots.push(node.shadowRoot);
      }
    }
    
    return roots;
  }

  // Element Finding with Multiple Strategies including Shadow DOM
  async findElement(selectors, timeout = 3000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const roots = this.getAllDocumentRoots();
      
      for (const selector of selectors) {
        try {
          let element = null;

          // Search in all document roots (including shadow DOMs)
          for (const root of roots) {
            switch (selector.type) {
              case 'css':
                element = root.querySelector?.(selector.value);
                break;
                
              case 'xpath':
                if (root === document) { // XPath only works on document
                  const result = document.evaluate(
                    selector.value, 
                    document, 
                    null, 
                    XPathResult.FIRST_ORDERED_NODE_TYPE, 
                    null
                  );
                  element = result.singleNodeValue;
                }
                break;
                
              case 'aria':
                // Find by aria-label, aria-labelledby, or title
                element = root.querySelector?.(`[aria-label="${selector.value}"]`) ||
                         root.querySelector?.(`[title="${selector.value}"]`) ||
                         this.findByAriaLabelledByInRoot(selector.value, root);
                break;
                
              case 'text':
                element = this.findByTextInRoot(selector.value, root);
                break;
            }
            
            if (element && this.isElementVisible(element)) {
              this.log(`Found element using ${selector.type}: ${selector.value}`);
              return element;
            }
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      // Wait a bit before trying again
      await this.sleep(50);
    }
    
    this.log(`Could not find element with selectors: ${JSON.stringify(selectors)}`);
    return null;
  }

  findByAriaLabelledByInRoot(ariaLabel, root) {
    if (!root.querySelectorAll) return null;
    
    const elements = root.querySelectorAll('[aria-labelledby]');
    for (const el of elements) {
      const labelIds = el.getAttribute('aria-labelledby').split(/\s+/);
      const labels = labelIds.map(id => (root.getElementById || document.getElementById)(id)).filter(Boolean);
      const combinedText = labels.map(label => label.textContent || '').join(' ').trim();
      if (combinedText === ariaLabel) return el;
    }
    return null;
  }

  findByTextInRoot(text, root) {
    if (root === document) {
      const xpath = `//*[contains(text(), "${text}")]`;
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue;
    } else if (root.querySelectorAll) {
      // For shadow roots, use querySelectorAll and check textContent
      const elements = root.querySelectorAll('*');
      for (const el of elements) {
        if (el.textContent && el.textContent.includes(text)) {
          return el;
        }
      }
    }
    return null;
  }

  isElementVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           rect.width > 0 && 
           rect.height > 0;
  }

  // Realistic Event Simulation
  simulateMouseEvent(element, eventType, options = {}) {
    const rect = element.getBoundingClientRect();
    const x = options.x !== undefined ? options.x : rect.width / 2;
    const y = options.y !== undefined ? options.y : rect.height / 2;
    
    const clientX = rect.left + x;
    const clientY = rect.top + y;

    // Create realistic event sequence: pointer -> mouse -> click
    const events = [];
    
    if (eventType === 'click') {
      events.push(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          button: 0,
          buttons: 1
        }),
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          button: 0,
          buttons: 1
        }),
        new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          button: 0,
          buttons: 0
        }),
        new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          button: 0,
          buttons: 0
        }),
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          button: 0,
          buttons: 0
        })
      );
    } else if (eventType === 'hover') {
      events.push(
        new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY
        }),
        new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY
        }),
        new MouseEvent('mouseenter', {
          bubbles: false,
          cancelable: false,
          clientX,
          clientY
        }),
        new MouseEvent('mouseover', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY
        })
      );
    }

    // Dispatch events
    events.forEach(event => {
      element.dispatchEvent(event);
    });
  }

  simulateKeyboardEvent(element, key, options = {}) {
    const modifiers = options.modifiers || [];
    const action = options.action || 'press';
    
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      key: key,
      code: this.getKeyCode(key),
      altKey: modifiers.includes('Alt'),
      ctrlKey: modifiers.includes('Control'),
      metaKey: modifiers.includes('Meta'),
      shiftKey: modifiers.includes('Shift')
    };

    if (action === 'down' || action === 'press') {
      element.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    }
    
    if (action === 'press') {
      element.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
    }
    
    if (action === 'up' || action === 'press') {
      element.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
    }
  }

  getKeyCode(key) {
    const keyCodeMap = {
      'Enter': 'Enter',
      'Tab': 'Tab',
      'Escape': 'Escape',
      'Backspace': 'Backspace',
      'Delete': 'Delete',
      'ArrowUp': 'ArrowUp',
      'ArrowDown': 'ArrowDown',
      'ArrowLeft': 'ArrowLeft',
      'ArrowRight': 'ArrowRight',
      ' ': 'Space'
    };
    return keyCodeMap[key] || `Key${key.toUpperCase()}`;
  }

  // Trace Execution
  async executeStep(step) {
    this.log(`Executing step ${this.currentStep + 1}: ${step.type}`);
    
    try {
      switch (step.type) {
        case 'navigate':
          await this.executeNavigate(step);
          break;
        case 'click':
          await this.executeClick(step);
          break;
        case 'type':
          await this.executeType(step);
          break;
        case 'hover':
          await this.executeHover(step);
          break;
        case 'scroll':
          await this.executeScroll(step);
          break;
        case 'submit':
          await this.executeSubmit(step);
          break;
        case 'select':
          await this.executeSelect(step);
          break;
        case 'change':
          await this.executeChange(step);
          break;
        case 'key':
          await this.executeKey(step);
          break;
        case 'drag':
          await this.executeDrag(step);
          break;
        default:
          this.log(`Unknown step type: ${step.type}`);
      }
    } catch (error) {
      this.log(`Error executing step: ${error.message}`);
    }
  }

  async executeNavigate(step) {
    if (window.location.href !== step.url) {
      this.log(`Navigating to: ${step.url}`);
      window.location.href = step.url;
      // Wait for page load
      await this.waitForPageLoad();
    }
  }

  async executeClick(step) {
    const element = await this.findElement(step.selectors);
    if (!element) return;
    
    this.simulateMouseEvent(element, 'click', { 
      x: step.x, 
      y: step.y 
    });
  }

  async executeType(step) {
    const element = await this.findElement(step.selectors);
    if (!element) return;

    // Focus the element first
    element.focus();
    
    // Clear existing content
    if (element.value !== undefined) {
      element.value = '';
    } else if (element.textContent !== undefined) {
      element.textContent = '';
    }

    // Type the text with realistic timing
    for (let char of step.text) {
      if (element.value !== undefined) {
        element.value += char;
      } else if (element.textContent !== undefined) {
        element.textContent += char;
      }
      
      // Trigger input event
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: char,
        inputType: 'insertText'
      }));
      
      // Small delay between characters
      await this.sleep(50 + Math.random() * 100);
    }
  }

  async executeHover(step) {
    const element = await this.findElement(step.selectors);
    if (!element) return;
    
    this.simulateMouseEvent(element, 'hover', {
      x: step.x,
      y: step.y
    });
  }

  async executeScroll(step) {
    if (step.target === 'window') {
      window.scrollTo(step.x, step.y);
    } else {
      const element = await this.findElement(step.selectors);
      if (element) {
        element.scrollLeft = step.x;
        element.scrollTop = step.y;
      }
    }
  }

  async executeSubmit(step) {
    const form = await this.findElement(step.formSelectors);
    if (!form) return;
    
    // Try to submit the form
    if (form.submit) {
      form.submit();
    } else {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
  }

  async executeSelect(step) {
    const element = await this.findElement(step.selectors);
    if (!element || !(element instanceof HTMLSelectElement)) return;
    
    if (Array.isArray(step.value)) {
      // Multiple selection
      Array.from(element.options).forEach(option => {
        option.selected = step.value.includes(option.value);
      });
    } else {
      // Single selection
      element.value = step.value;
    }
    
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async executeChange(step) {
    const element = await this.findElement(step.selectors);
    if (!element) return;
    
    if (element.type === 'checkbox' || element.type === 'radio') {
      element.checked = step.value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  async executeKey(step) {
    const element = await this.findElement(step.selectors);
    if (!element) return;
    
    this.simulateKeyboardEvent(element, step.key, {
      modifiers: step.modifiers,
      action: step.action
    });
  }

  async executeDrag(step) {
    const element = await this.findElement(step.selectors);
    if (!element) return;
    
    // Simulate drag sequence
    const rect = element.getBoundingClientRect();
    const startX = rect.left + step.from.x;
    const startY = rect.top + step.from.y;
    
    // Mouse down
    this.simulateMouseEvent(element, 'mousedown', {
      x: step.from.x,
      y: step.from.y
    });
    
    // Simulate drag path if available
    if (step.path && step.path.length > 0) {
      for (const point of step.path) {
        await this.sleep(16); // 60fps
        element.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true,
          clientX: point.x,
          clientY: point.y,
          buttons: 1
        }));
      }
    }
    
    // Mouse up at target
    const targetElement = step.targetSelectors ? await this.findElement(step.targetSelectors) : element;
    if (targetElement) {
      targetElement.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        clientX: step.to.x,
        clientY: step.to.y,
        button: 0
      }));
    }
  }

  // Utility Methods
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms / this.speed));
  }

  async waitForPageLoad() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', resolve, { once: true });
      }
    });
  }

  // Main Replay Method
  async replay(trace, options = {}) {
    this.trace = trace;
    this.speed = options.speed || 1.0;
    this.debug = options.debug !== false;
    this.isReplaying = true;
    this.startTime = Date.now();
    
    this.log(`Starting replay of ${trace.steps.length} steps`);
    
    // Create input guard to prevent user interference
    this.inputGuard = this.createInputGuard();
    
    try {
      // Execute each step with proper timing
      for (let i = 0; i < trace.steps.length; i++) {
        this.currentStep = i;
        const step = trace.steps[i];
        
        // Wait for the correct timing
        const expectedTime = step.timestamp / this.speed;
        const elapsedTime = Date.now() - this.startTime;
        const waitTime = expectedTime - elapsedTime;
        
        if (waitTime > 0) {
          await this.sleep(waitTime);
        }
        
        await this.executeStep(step);
      }
      
      this.log('Replay completed successfully');
    } catch (error) {
      this.log(`Replay error: ${error.message}`);
    } finally {
      this.removeInputGuard();
      this.isReplaying = false;
    }
  }
}

// Global replayer instance
window.actionReplayer = new ActionReplayer();

// Message handler for external control
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'REPLAY_TRACE') {
      window.actionReplayer.replay(message.trace, message.options || {})
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response
    }
  });
}