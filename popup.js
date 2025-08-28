class PopupController {
  constructor() {
    this.isRecording = false;
    this.initializeElements();
    this.setupEventListeners();
    this.checkRecordingStatus();
  }

  initializeElements() {
    this.startBtn = document.getElementById('startBtn');
    this.stopBtn = document.getElementById('stopBtn');
    this.statusEl = document.getElementById('status');
    this.messageEl = document.getElementById('message');
  }

  setupEventListeners() {
    this.startBtn.addEventListener('click', () => this.startRecording());
    this.stopBtn.addEventListener('click', () => this.stopRecording());
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

  updateUI() {
    this.startBtn.disabled = this.isRecording;
    this.stopBtn.disabled = !this.isRecording;
    
    if (this.isRecording) {
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