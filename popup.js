class PopupController {
  constructor() {
    this.isRecording = false;
    this.isReplaying = false;
    this.selectedTrace = null;
    this.initializeElements();
    this.setupEventListeners();
    this.checkRecordingStatus();
  }

  initializeElements() {
    this.startBtn = document.getElementById('startBtn');
    this.stopBtn = document.getElementById('stopBtn');
    this.statusEl = document.getElementById('status');
    this.messageEl = document.getElementById('message');
    this.traceFile = document.getElementById('traceFile');
    this.fileName = document.getElementById('fileName');
    this.replayBtn = document.getElementById('replayBtn');
  }

  setupEventListeners() {
    this.startBtn.addEventListener('click', () => this.startRecording());
    this.stopBtn.addEventListener('click', () => this.stopRecording());
    this.traceFile.addEventListener('change', (e) => this.handleFileSelect(e));
    this.replayBtn.addEventListener('click', () => this.startReplay());
  }

  async checkRecordingStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      if (response?.isRecording) {
        this.isRecording = true;
        this.updateUI();
      }
    } catch (error) {
      console.log('Background script not ready yet');
    }
  }

  async startRecording() {
    this.hideMessage();
    
    try {
      const response = await chrome.runtime.sendMessage({ type: 'START_RECORDING' });
      
      if (response?.success) {
        this.isRecording = true;
        this.updateUI();
        this.showMessage('Recording started!', 'success');
      } else {
        this.showMessage(response?.error || 'Failed to start recording', 'error');
      }
    } catch (error) {
      this.showMessage('Error: ' + error.message, 'error');
    }
  }

  async stopRecording() {
    this.hideMessage();
    
    try {
      const response = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
      
      if (response?.success) {
        this.isRecording = false;
        this.updateUI();
        this.showMessage(`Recording saved! Captured ${response.eventCount || 0} events.`, 'success');
      } else {
        this.showMessage(response?.error || 'Failed to stop recording', 'error');
      }
    } catch (error) {
      this.showMessage('Error: ' + error.message, 'error');
    }
  }

  handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
      this.selectedTrace = null;
      this.fileName.textContent = '';
      this.replayBtn.disabled = true;
      return;
    }

    if (!file.name.endsWith('.json')) {
      this.showMessage('Please select a JSON file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        this.selectedTrace = JSON.parse(e.target.result);
        this.fileName.textContent = file.name;
        this.replayBtn.disabled = false;
        this.showMessage(`Trace loaded: ${this.selectedTrace.steps?.length || 0} steps`, 'success');
      } catch (error) {
        this.showMessage('Invalid JSON file', 'error');
        this.selectedTrace = null;
        this.replayBtn.disabled = true;
      }
    };
    reader.readAsText(file);
  }

  async startReplay() {
    if (!this.selectedTrace) {
      this.showMessage('No trace selected', 'error');
      return;
    }

    this.hideMessage();
    this.isReplaying = true;
    this.updateUI();

    try {
      const response = await chrome.runtime.sendMessage({ 
        type: 'START_REPLAY', 
        trace: this.selectedTrace 
      });
      
      if (response?.success) {
        this.showMessage('Replay started! Check the page for execution.', 'success');
        
        // Listen for replay completion
        const messageListener = (message) => {
          if (message.type === 'REPLAY_COMPLETE') {
            this.isReplaying = false;
            this.updateUI();
            this.showMessage('Replay completed successfully!', 'success');
            chrome.runtime.onMessage.removeListener(messageListener);
          } else if (message.type === 'REPLAY_ERROR') {
            this.isReplaying = false;
            this.updateUI();
            this.showMessage(`Replay failed: ${message.error}`, 'error');
            chrome.runtime.onMessage.removeListener(messageListener);
          }
        };
        
        chrome.runtime.onMessage.addListener(messageListener);
      } else {
        this.isReplaying = false;
        this.updateUI();
        this.showMessage(response?.error || 'Failed to start replay', 'error');
      }
    } catch (error) {
      this.isReplaying = false;
      this.updateUI();
      this.showMessage('Error: ' + error.message, 'error');
    }
  }

  updateUI() {
    this.startBtn.disabled = this.isRecording || this.isReplaying;
    this.stopBtn.disabled = !this.isRecording;
    this.replayBtn.disabled = !this.selectedTrace || this.isRecording || this.isReplaying;
    
    if (this.isReplaying) {
      this.statusEl.className = 'status replaying';
      this.statusEl.textContent = 'Replaying trace...';
    } else if (this.isRecording) {
      this.statusEl.className = 'status recording';
      this.statusEl.textContent = 'Recording in progress...';
    } else {
      this.statusEl.className = 'status idle';
      this.statusEl.textContent = 'Ready to record';
    }
  }

  showMessage(text, type) {
    this.messageEl.textContent = text;
    this.messageEl.className = `message ${type} visible`;
    
    setTimeout(() => this.hideMessage(), 3000);
  }

  hideMessage() {
    this.messageEl.classList.remove('visible');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});