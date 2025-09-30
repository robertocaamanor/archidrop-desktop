import { ProcessingProgress } from '../types/global';

class ArchidropApp {
  private inputPath: string = '';
  private dropboxPath: string = '';
  private isProcessing: boolean = false;

  constructor() {
    this.initializeElements();
    this.loadSettings();
    this.setupEventListeners();
  }

  private initializeElements(): void {
    console.log('Initializing elements...');
    console.log('window.electronAPI available:', !!window.electronAPI);
    
    // Input elements
    this.getElement('select-input-btn').addEventListener('click', () => {
      console.log('Select input button clicked');
      this.selectInputFolder();
    });
    this.getElement('select-dropbox-btn').addEventListener('click', () => {
      console.log('Select dropbox button clicked');
      this.selectDropboxFolder();
    });
    this.getElement('process-btn').addEventListener('click', () => this.startProcessing());
    
    // Settings modal
    this.getElement('settings-btn').addEventListener('click', () => this.showSettings());
    this.getElement('settings-cancel').addEventListener('click', () => this.hideSettings());
    this.getElement('settings-save').addEventListener('click', () => this.saveSettings());
  }

  private getElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Element with id '${id}' not found`);
    }
    return element;
  }

  private async loadSettings(): Promise<void> {
    try {
      const settings = await window.electronAPI.getSettings();
      
      if (settings.dropboxPath) {
        this.dropboxPath = settings.dropboxPath;
        (this.getElement('dropbox-path') as HTMLInputElement).value = settings.dropboxPath;
      }
      
      if (settings.lastInputPath) {
        this.inputPath = settings.lastInputPath;
        (this.getElement('input-path') as HTMLInputElement).value = settings.lastInputPath;
      }
      
      (this.getElement('auto-open-setting') as HTMLInputElement).checked = settings.autoOpen || false;
      
      this.updateProcessButton();
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  private setupEventListeners(): void {
    // Listen for processing progress updates
    window.electronAPI.onProcessingProgress((progress: ProcessingProgress) => {
      this.updateProgress(progress);
    });
  }

  private async selectInputFolder(): Promise<void> {
    console.log('selectInputFolder called');
    try {
      if (!window.electronAPI) {
        console.error('electronAPI not available');
        this.showError('API de Electron no disponible');
        return;
      }
      
      console.log('Calling window.electronAPI.selectFolder()');
      const result = await window.electronAPI.selectFolder();
      console.log('selectFolder result:', result);
      
      if (!result.canceled && result.filePaths.length > 0) {
        this.inputPath = result.filePaths[0];
        (this.getElement('input-path') as HTMLInputElement).value = this.inputPath;
        this.updateProcessButton();
        console.log('Input path set to:', this.inputPath);
      }
    } catch (error) {
      console.error('Error selecting input folder:', error);
      this.showError('Error al seleccionar la carpeta de entrada');
    }
  }

  private async selectDropboxFolder(): Promise<void> {
    try {
      const result = await window.electronAPI.selectDropboxFolder();
      
      if (!result.canceled && result.filePaths.length > 0) {
        this.dropboxPath = result.filePaths[0];
        (this.getElement('dropbox-path') as HTMLInputElement).value = this.dropboxPath;
        this.updateProcessButton();
      }
    } catch (error) {
      console.error('Error selecting Dropbox folder:', error);
      this.showError('Error al seleccionar la carpeta de Dropbox');
    }
  }

  private updateProcessButton(): void {
    const processBtn = this.getElement('process-btn') as HTMLButtonElement;
    processBtn.disabled = !this.inputPath || !this.dropboxPath || this.isProcessing;
  }

  private async startProcessing(): Promise<void> {
    if (this.isProcessing || !this.inputPath || !this.dropboxPath) {
      return;
    }

    this.isProcessing = true;
    this.updateProcessButton();
    
    // Show progress card
    this.getElement('progress-card').classList.remove('hidden');
    this.getElement('results-card').classList.add('hidden');
    
    try {
      const result = await window.electronAPI.startProcessing(this.inputPath, this.dropboxPath);
      
      if (result.success) {
        this.showResults(result);
      } else {
        this.showError(result.error || 'Error desconocido durante el procesamiento');
      }
    } catch (error) {
      console.error('Error during processing:', error);
      this.showError('Error inesperado durante el procesamiento');
    } finally {
      this.isProcessing = false;
      this.updateProcessButton();
      this.getElement('progress-card').classList.add('hidden');
    }
  }

  private updateProgress(progress: ProcessingProgress): void {
    // Update progress bar
    const progressBar = this.getElement('progress-bar') as HTMLElement;
    const progressText = this.getElement('progress-text') as HTMLElement;
    const progressPercentage = this.getElement('progress-percentage') as HTMLElement;
    const currentFile = this.getElement('current-file') as HTMLElement;
    const processedCount = this.getElement('processed-count') as HTMLElement;
    const totalCount = this.getElement('total-count') as HTMLElement;

    progressBar.style.width = `${progress.percentage}%`;
    progressText.textContent = progress.status;
    progressPercentage.textContent = `${Math.round(progress.percentage)}%`;
    currentFile.textContent = progress.currentFile || '-';
    processedCount.textContent = progress.current.toString();
    totalCount.textContent = progress.total.toString();
  }

  private showResults(result: any): void {
    const resultsCard = this.getElement('results-card');
    const resultsContent = this.getElement('results-content');
    
    let html = '<div class="space-y-2">';
    
    if (result.processed) {
      html += `<div class="flex items-center text-green-600">
        <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
        </svg>
        Procesamiento completado exitosamente
      </div>`;
      html += `<div class="text-sm text-gray-600">Archivos procesados: ${result.processed}</div>`;
    }
    
    if (result.errors && result.errors.length > 0) {
      html += `<div class="mt-4">
        <h4 class="text-sm font-medium text-red-600 mb-2">Errores encontrados:</h4>
        <ul class="text-sm text-red-500 space-y-1">`;
      result.errors.forEach((error: string) => {
        html += `<li>• ${error}</li>`;
      });
      html += '</ul></div>';
    }
    
    html += '</div>';
    
    resultsContent.innerHTML = html;
    resultsCard.classList.remove('hidden');
  }

  private showError(message: string): void {
    const resultsCard = this.getElement('results-card');
    const resultsContent = this.getElement('results-content');
    
    resultsContent.innerHTML = `
      <div class="flex items-center text-red-600">
        <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
        </svg>
        Error: ${message}
      </div>
    `;
    
    resultsCard.classList.remove('hidden');
  }

  private showSettings(): void {
    this.getElement('settings-modal').classList.remove('hidden');
  }

  private hideSettings(): void {
    this.getElement('settings-modal').classList.add('hidden');
  }

  private async saveSettings(): Promise<void> {
    try {
      const autoOpen = (this.getElement('auto-open-setting') as HTMLInputElement).checked;
      
      const settings = {
        dropboxPath: this.dropboxPath,
        lastInputPath: this.inputPath,
        autoOpen: autoOpen
      };
      
      await window.electronAPI.saveSettings(settings);
      this.hideSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showError('Error al guardar la configuración');
    }
  }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing ArchidropApp');
  console.log('electronAPI available:', !!window.electronAPI);
  new ArchidropApp();
});