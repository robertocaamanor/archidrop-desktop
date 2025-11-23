import { ProcessingProgress } from '../types/global';

class ArchidropApp {
  private inputPath: string = '';
  private dropboxPath: string = '';
  private isProcessing: boolean = false;
  private useDateFolder: boolean = false;

  constructor() {
    this.initializeElements();
    this.loadSettings();
    this.setupEventListeners();
  }

  private initializeElements(): void {
    console.log('Initializing elements...');
    console.log('window.electronAPI available:', !!window.electronAPI);
    
    // Input elements - folder selection buttons
    this.getElement('select-downloads-btn').addEventListener('click', () => {
      this.selectDownloadsFolder();
    });
    
    this.getElement('select-dropbox-btn').addEventListener('click', () => {
      this.selectDropboxFolder();
    });
    
    this.getElement('select-custom-btn').addEventListener('click', () => {
      this.selectInputFolder();
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
      
      if (settings.lastInputPath) {
        this.inputPath = settings.lastInputPath;
        (this.getElement('input-path') as HTMLInputElement).value = settings.lastInputPath;
      }
      
      (this.getElement('auto-open-setting') as HTMLInputElement).checked = settings.autoOpen || false;
      this.useDateFolder = settings.useDateFolder || false;
      (this.getElement('use-date-folder-setting') as HTMLInputElement).checked = this.useDateFolder;
      
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
        
        // Automatically preview files after selecting folder
        await this.previewFiles();
      }
    } catch (error) {
      console.error('Error selecting input folder:', error);
      this.showError('Error al seleccionar la carpeta de entrada');
    }
  }

  private async selectDownloadsFolder(): Promise<void> {
    try {
      if (!window.electronAPI) {
        this.showError('API de Electron no disponible');
        return;
      }
      
      const result = await window.electronAPI.getDownloadsPath();
      
      if (result && result.path) {
        this.inputPath = result.path;
        (this.getElement('input-path') as HTMLInputElement).value = this.inputPath;
        this.updateProcessButton();
        
        // Automatically preview files after selecting folder
        await this.previewFiles();
      }
    } catch (error) {
      console.error('Error selecting downloads folder:', error);
      this.showError('Error al seleccionar la carpeta de descargas');
    }
  }

  private async selectDropboxFolder(): Promise<void> {
    try {
      if (!window.electronAPI) {
        this.showError('API de Electron no disponible');
        return;
      }
      
      const result = await window.electronAPI.getDropboxPath();
      
      if (result && result.path) {
        this.inputPath = result.path;
        (this.getElement('input-path') as HTMLInputElement).value = this.inputPath;
        this.updateProcessButton();
        
        // Automatically preview files after selecting folder
        await this.previewFiles();
      }
    } catch (error) {
      console.error('Error selecting Dropbox folder:', error);
      this.showError('Error al seleccionar la carpeta de Dropbox');
    }
  }

  private updateProcessButton(): void {
    const processBtn = this.getElement('process-btn') as HTMLButtonElement;
    processBtn.disabled = !this.inputPath || this.isProcessing;
  }

  private async startProcessing(): Promise<void> {
    if (this.isProcessing || !this.inputPath) {
      return;
    }

    // Get selected files
    const checkboxes = document.querySelectorAll('.file-checkbox:checked') as NodeListOf<HTMLInputElement>;
    const selectedFiles = Array.from(checkboxes)
      .map(cb => cb.dataset.filename)
      .filter((filename): filename is string => !!filename);
    
    if (selectedFiles.length === 0) {
      this.showError('Selecciona al menos un archivo para procesar');
      return;
    }

    // Get delete originals option
    const deleteOriginalsCheckbox = this.getElement('delete-originals') as HTMLInputElement;
    const deleteOriginals = deleteOriginalsCheckbox?.checked || false;

    this.isProcessing = true;
    this.updateProcessButton();
    
    // Show progress card
    this.getElement('progress-card').classList.remove('hidden');
    this.getElement('results-card').classList.add('hidden');
    
    try {
      const result = await window.electronAPI.startProcessing(this.inputPath, selectedFiles, deleteOriginals, this.useDateFolder);
      
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
      const useDateFolder = (this.getElement('use-date-folder-setting') as HTMLInputElement).checked;
      this.useDateFolder = useDateFolder;
      
      const settings = {
        lastInputPath: this.inputPath,
        autoOpen: autoOpen,
        useDateFolder: useDateFolder
      };
      
      await window.electronAPI.saveSettings(settings);
      this.hideSettings();
      await this.previewFiles();
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showError('Error al guardar la configuración');
    }
  }

  private async previewFiles(): Promise<void> {
    if (!this.inputPath) return;

    try {
      const result = await window.electronAPI.previewFiles(this.inputPath, this.useDateFolder);

      if (result.success) {
        // Preview functionality can be implemented here if needed
        // For now, we'll just log it since renderer-simple.ts handles the full UI
        console.log('Preview results:', result);
      } else {
        this.showError(result.error || 'Error al previsualizar archivos');
      }
    } catch (error) {
      console.error('Error previewing files:', error);
      this.showError('Error inesperado al previsualizar archivos');
    }
  }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing ArchidropApp');
  console.log('electronAPI available:', !!window.electronAPI);
  new ArchidropApp();
});