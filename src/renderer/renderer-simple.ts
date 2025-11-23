// Archidrop Desktop - Renderer Process

class ArchidropApp {
  private electronAPI: any;
  private activeTab: 'zip' | 'date' = 'zip';
  private zipInputPath = '';
  private zipIsProcessing = false;
  private zipUseDateFolder = false;
  private dateInputPath = '';
  private dateIsProcessing = false;
  private dateOperation: 'move' | 'copy' = 'move';
  private autoOpen = false;

  constructor() {
    this.electronAPI = (window as any).electronAPI;
    if (!this.electronAPI) {
      throw new Error('electronAPI not available');
    }

    this.initializeTabs();
    this.initializeZipTab();
    this.initializeDateTab();
    void this.loadSettings();
    this.setupProgressListeners();
  }

  private getElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Element with id '${id}' not found`);
    }
    return element;
  }

  private initializeTabs(): void {
    const tabButtons = document.querySelectorAll<HTMLButtonElement>('[data-tab]');
    tabButtons.forEach(button => {
      const tab = (button.dataset.tab as 'zip' | 'date') || 'zip';
      button.addEventListener('click', () => this.switchTab(tab));
    });

    this.switchTab(this.activeTab);
  }

  private switchTab(tab: 'zip' | 'date'): void {
    this.activeTab = tab;

    const tabButtons = document.querySelectorAll<HTMLButtonElement>('[data-tab]');
    tabButtons.forEach(button => {
      const isActive = button.dataset.tab === tab;
      button.classList.toggle('bg-blue-100', isActive);
      button.classList.toggle('text-blue-700', isActive);
      button.classList.toggle('text-gray-600', !isActive);
      button.classList.toggle('hover:text-gray-800', !isActive);
      button.classList.toggle('hover:bg-gray-100', !isActive);
    });

    const panels = document.querySelectorAll<HTMLElement>('[data-tab-panel]');
    panels.forEach(panel => {
      const isActive = panel.getAttribute('data-tab-panel') === tab;
      panel.classList.toggle('hidden', !isActive);
    });
  }

  private initializeZipTab(): void {
    this.getElement('zip-select-downloads-btn').addEventListener('click', () => {
      void this.selectZipDownloadsFolder();
    });

    this.getElement('zip-select-dropbox-btn').addEventListener('click', () => {
      void this.selectZipDropboxFolder();
    });

    this.getElement('zip-select-custom-btn').addEventListener('click', () => {
      void this.selectZipCustomFolder();
    });

    this.getElement('zip-process-btn').addEventListener('click', () => {
      void this.startZipProcessing();
    });

    this.getElement('settings-btn').addEventListener('click', () => this.showSettings());
    this.getElement('settings-cancel').addEventListener('click', () => this.hideSettings());
    this.getElement('settings-save').addEventListener('click', () => {
      void this.saveSettings();
    });

    this.updateZipProcessButton();
  }

  private initializeDateTab(): void {
    this.getElement('date-select-custom-btn').addEventListener('click', () => {
      void this.selectDateCustomFolder();
    });

    this.getElement('date-process-btn').addEventListener('click', () => {
      void this.startDateProcessing();
    });

    this.getElement('date-operation-switch').addEventListener('click', () => {
      this.dateOperation = this.dateOperation === 'copy' ? 'move' : 'copy';
      this.updateDateOperationSwitch();
      this.updateDateProcessButtonLabel();
    });

    this.updateDateProcessButton();
    this.updateDateOperationSwitch();
  }

  private async loadSettings(): Promise<void> {
    try {
      const settings = await this.electronAPI.getSettings();

      if (settings.lastInputPath) {
        this.zipInputPath = settings.lastInputPath;
        (this.getElement('zip-input-path') as HTMLInputElement).value = settings.lastInputPath;

        this.dateInputPath = settings.lastInputPath;
        (this.getElement('date-input-path') as HTMLInputElement).value = settings.lastInputPath;
      }

      this.autoOpen = settings.autoOpen || false;
      (this.getElement('auto-open-setting') as HTMLInputElement).checked = this.autoOpen;
      this.zipUseDateFolder = settings.useDateFolder || false;
      (this.getElement('use-date-folder-setting') as HTMLInputElement).checked = this.zipUseDateFolder;

      this.updateZipProcessButton();
      this.updateDateProcessButton();
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  private setupProgressListeners(): void {
    this.electronAPI.onZipProcessingProgress((progress: any) => {
      this.updateZipProgress(progress);
    });

    this.electronAPI.onDateProcessingProgress((progress: any) => {
      this.updateDateProgress(progress);
    });
  }

  private async selectZipCustomFolder(): Promise<void> {
    try {
      const result = await this.electronAPI.selectFolder();
      if (!result.canceled && result.filePaths.length > 0) {
        await this.handleZipPathSelection(result.filePaths[0]);
      }
    } catch (error) {
      console.error('Error selecting custom folder:', error);
      this.showZipError('Error al seleccionar la carpeta de entrada');
    }
  }

  private async selectZipDownloadsFolder(): Promise<void> {
    try {
      const result = await this.electronAPI.getDownloadsPath();
      if (result?.path) {
        await this.handleZipPathSelection(result.path);
      }
    } catch (error) {
      console.error('Error selecting downloads folder:', error);
      this.showZipError('Error al seleccionar la carpeta de descargas');
    }
  }

  private async selectZipDropboxFolder(): Promise<void> {
    try {
      const result = await this.electronAPI.getDropboxPath();
      if (result?.path) {
        await this.handleZipPathSelection(result.path);
      }
    } catch (error) {
      console.error('Error selecting Dropbox folder:', error);
      this.showZipError('Error al seleccionar la carpeta de Dropbox');
    }
  }

  private async handleZipPathSelection(newPath: string): Promise<void> {
    this.zipInputPath = newPath;
    (this.getElement('zip-input-path') as HTMLInputElement).value = newPath;
    this.updateZipProcessButton();
    await this.previewZipFiles();
  }

  private updateZipProcessButton(): void {
    const processBtn = this.getElement('zip-process-btn') as HTMLButtonElement;
    const checkboxes = document.querySelectorAll('.zip-file-checkbox') as NodeListOf<HTMLInputElement>;
    const hasSelectedFiles = Array.from(checkboxes).some(cb => cb.checked);
    const canProcess = !this.zipIsProcessing && Boolean(this.zipInputPath) && checkboxes.length > 0 && hasSelectedFiles;
    processBtn.disabled = !canProcess;
  }

  private async previewZipFiles(): Promise<void> {
    if (!this.zipInputPath) {
      return;
    }

    try {
      const result = await this.electronAPI.previewFiles(this.zipInputPath, this.zipUseDateFolder);
      if (result.success) {
        this.showZipPreviewResults(result);
      } else {
        this.showZipError(result.error || 'Error al previsualizar archivos');
      }
    } catch (error) {
      console.error('Error previewing ZIP files:', error);
      this.showZipError('Error inesperado al previsualizar archivos');
    }
  }

  private showZipPreviewResults(result: any): void {
    const previewCard = this.getElement('zip-preview-card');
    const previewContent = this.getElement('zip-preview-content');
    const previewCount = this.getElement('zip-preview-count');
    const selectedCount = this.getElement('zip-selected-count');

    previewCount.textContent = result.processableFiles.toString();

    let html = '';

    if (result.items.length > 0) {
      html += '<div class="space-y-3">';
      result.items.forEach((item: any, index: number) => {
        html += `<div class="p-3 bg-green-50 border border-green-200 rounded-lg">
          <div class="flex items-start space-x-3">
            <input type="checkbox" id="zip-file-${index}" data-filename="${item.fileName}" 
                   class="zip-file-checkbox mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked>
            <div class="flex-1">
              <label for="zip-file-${index}" class="font-medium text-green-800 cursor-pointer">${item.fileName}</label>
              <div class="text-sm text-green-600 mt-1">
                📁 ${item.targetPathLabel || ''}
              </div>
            </div>
          </div>
        </div>`;
      });
      html += '</div>';

      selectedCount.textContent = result.processableFiles.toString();
    } else {
      html = '<div class="text-center py-8 text-gray-500">No se encontraron archivos que cumplan con el patrón de nomenclatura requerido.</div>';
      selectedCount.textContent = '0';
    }

    previewContent.innerHTML = html;
    this.setupZipCheckboxListeners();
    previewCard.classList.remove('hidden');
    this.updateZipProcessButton();
  }

  private setupZipCheckboxListeners(): void {
    const checkboxes = document.querySelectorAll('.zip-file-checkbox') as NodeListOf<HTMLInputElement>;
    const selectedCount = this.getElement('zip-selected-count');
    let selectAllBtn = this.getElement('zip-select-all-btn') as HTMLButtonElement;

    const updateCounts = () => {
      const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
      selectedCount.textContent = checkedCount.toString();
      const allChecked = checkedCount === checkboxes.length && checkboxes.length > 0;
      if (allChecked) {
        selectAllBtn.textContent = 'Deseleccionar todos';
      } else {
        selectAllBtn.textContent = 'Seleccionar todos';
      }
      this.updateZipProcessButton();
    };

    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', updateCounts);
    });

    selectAllBtn.replaceWith(selectAllBtn.cloneNode(true));
    selectAllBtn = this.getElement('zip-select-all-btn') as HTMLButtonElement;
    selectAllBtn.addEventListener('click', () => {
      const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
      const shouldCheck = checkedCount !== checkboxes.length;
      checkboxes.forEach(checkbox => {
        checkbox.checked = shouldCheck;
      });
      updateCounts();
    });

    updateCounts();
  }

  private async startZipProcessing(): Promise<void> {
    if (this.zipIsProcessing || !this.zipInputPath) {
      return;
    }

    const checkboxes = document.querySelectorAll('.zip-file-checkbox:checked') as NodeListOf<HTMLInputElement>;
    const selectedFiles = Array.from(checkboxes).map(cb => cb.dataset.filename).filter(Boolean);

    if (selectedFiles.length === 0) {
      this.showZipError('Selecciona al menos un archivo para procesar');
      return;
    }

    const deleteOriginalsCheckbox = this.getElement('zip-delete-originals') as HTMLInputElement;
    const deleteOriginals = deleteOriginalsCheckbox?.checked || false;

    this.zipIsProcessing = true;
    this.updateZipProcessButton();

    this.getElement('zip-progress-card').classList.remove('hidden');
    this.getElement('zip-results-card').classList.add('hidden');

    try {
      const result = await this.electronAPI.startZipProcessing(
        this.zipInputPath,
        selectedFiles,
        deleteOriginals,
        this.zipUseDateFolder
      );

      if (result.success) {
        this.showZipResults(result);
        await this.handleAutoOpenDestinations(result.destinations);
        await this.previewZipFiles();
      } else {
        this.showZipError(result.error || 'Error desconocido durante el procesamiento');
      }
    } catch (error) {
      console.error('Error during ZIP processing:', error);
      this.showZipError('Error inesperado durante el procesamiento');
    } finally {
      this.zipIsProcessing = false;
      this.updateZipProcessButton();
      this.getElement('zip-progress-card').classList.add('hidden');
    }
  }

  private updateZipProgress(progress: any): void {
    const progressBar = this.getElement('zip-progress-bar') as HTMLElement;
    const progressText = this.getElement('zip-progress-text') as HTMLElement;
    const progressPercentage = this.getElement('zip-progress-percentage') as HTMLElement;
    const currentFile = this.getElement('zip-current-file') as HTMLElement;
    const processedCount = this.getElement('zip-processed-count') as HTMLElement;
    const totalCount = this.getElement('zip-total-count') as HTMLElement;

    progressBar.style.width = `${progress.percentage}%`;
    progressText.textContent = progress.status;
    progressPercentage.textContent = `${Math.round(progress.percentage)}%`;
    currentFile.textContent = progress.currentFile || '-';
    processedCount.textContent = progress.current.toString();
    totalCount.textContent = progress.total.toString();
  }

  private showZipResults(result: any): void {
    const resultsCard = this.getElement('zip-results-card');
    const resultsContent = this.getElement('zip-results-content');

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
      html += '<div class="mt-4">';
      html += '<h4 class="text-sm font-medium text-red-600 mb-2">Errores encontrados:</h4>';
      html += '<ul class="text-sm text-red-500 space-y-1">';
      result.errors.forEach((error: string) => {
        html += `<li>• ${error}</li>`;
      });
      html += '</ul></div>';
    }

    html += '</div>';

    resultsContent.innerHTML = html;
    resultsCard.classList.remove('hidden');
  }

  private showZipError(message: string): void {
    const resultsCard = this.getElement('zip-results-card');
    const resultsContent = this.getElement('zip-results-content');

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

  private async handleAutoOpenDestinations(destinations?: string[]): Promise<void> {
    if (!this.autoOpen || !destinations || destinations.length === 0) {
      return;
    }

    try {
      const uniqueDestinations = Array.from(new Set(destinations));
      const primaryDestination = uniqueDestinations[0];

      if (primaryDestination) {
        const openResult = await this.electronAPI.openPath(primaryDestination);
        if (openResult && openResult.success === false && openResult.error) {
          console.warn('No se pudo abrir la carpeta de destino:', openResult.error);
        }
      }
    } catch (error) {
      console.error('Error opening destination folder:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      const autoOpen = (this.getElement('auto-open-setting') as HTMLInputElement).checked;
      this.autoOpen = autoOpen;
      const useDateFolder = (this.getElement('use-date-folder-setting') as HTMLInputElement).checked;
      this.zipUseDateFolder = useDateFolder;

      const settings = {
        lastInputPath: this.zipInputPath,
        autoOpen,
        useDateFolder
      };

      await this.electronAPI.saveSettings(settings);
      this.hideSettings();
      await this.previewZipFiles();
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showZipError('Error al guardar la configuración');
    }
  }

  private showSettings(): void {
    this.getElement('settings-modal').classList.remove('hidden');
  }

  private hideSettings(): void {
    this.getElement('settings-modal').classList.add('hidden');
  }

  private async selectDateCustomFolder(): Promise<void> {
    try {
      const result = await this.electronAPI.selectFolder();
      if (!result.canceled && result.filePaths.length > 0) {
        await this.handleDatePathSelection(result.filePaths[0]);
      }
    } catch (error) {
      console.error('Error selecting custom folder:', error);
      this.showDateError('Error al seleccionar la carpeta de entrada');
    }
  }

  private async handleDatePathSelection(newPath: string): Promise<void> {
    this.dateInputPath = newPath;
    (this.getElement('date-input-path') as HTMLInputElement).value = newPath;
    this.updateDateProcessButton();
    await this.previewDateFiles();
  }

  private updateDateProcessButton(): void {
    const processBtn = this.getElement('date-process-btn') as HTMLButtonElement;
    const checkboxes = document.querySelectorAll('.date-file-checkbox') as NodeListOf<HTMLInputElement>;
    const hasSelectedFiles = Array.from(checkboxes).some(cb => cb.checked);
    const canProcess = !this.dateIsProcessing && Boolean(this.dateInputPath) && hasSelectedFiles;
    processBtn.disabled = !canProcess;
    this.updateDateProcessButtonLabel();
    this.updateDateOperationSwitch();
  }

  private updateDateProcessButtonLabel(): void {
    const processBtn = this.getElement('date-process-btn') as HTMLButtonElement;
    processBtn.textContent = this.dateOperation === 'copy' ? 'Copiar Archivos' : 'Mover Archivos';
  }

  private updateDateOperationSwitch(): void {
    const switchBtn = this.getElement('date-operation-switch') as HTMLButtonElement;
    const label = this.getElement('date-operation-switch-label');
    const track = this.getElement('date-operation-switch-track');
    const thumb = this.getElement('date-operation-switch-thumb');
    const isCopy = this.dateOperation === 'copy';

    label.textContent = isCopy ? 'Copiar archivos' : 'Mover archivos';
    switchBtn.setAttribute('aria-checked', isCopy ? 'true' : 'false');

    track.classList.remove('bg-gray-300', 'bg-blue-600');
    track.classList.add(isCopy ? 'bg-blue-600' : 'bg-gray-300');

    thumb.classList.remove('translate-x-1', 'translate-x-6');
    thumb.classList.add(isCopy ? 'translate-x-6' : 'translate-x-1');
  }

  private async previewDateFiles(): Promise<void> {
    if (!this.dateInputPath) {
      return;
    }

    try {
      const result = await this.electronAPI.previewDateFiles(this.dateInputPath);
      if (result.success) {
        this.showDatePreviewResults(result);
      } else {
        this.showDateError(result.error || 'Error al previsualizar archivos');
      }
    } catch (error) {
      console.error('Error previewing date files:', error);
      this.showDateError('Error inesperado al previsualizar archivos');
    }
  }

  private showDatePreviewResults(result: any): void {
    const previewCard = this.getElement('date-preview-card');
    const previewContent = this.getElement('date-preview-content');
    const previewCount = this.getElement('date-preview-count');
    const selectedCount = this.getElement('date-selected-count');

    previewCount.textContent = result.processableFiles.toString();

    let html = '';

    if (result.items.length > 0) {
      html += '<div class="space-y-3">';
      result.items.forEach((item: any, index: number) => {
        html += `<div class="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <div class="flex items-start space-x-3">
            <input type="checkbox" id="date-file-${index}" data-filename="${item.fileName}" 
                   class="date-file-checkbox mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked>
            <div class="flex-1">
              <label for="date-file-${index}" class="font-medium text-indigo-800 cursor-pointer">${item.fileName}</label>
              <div class="text-sm text-indigo-600 mt-1">
                📁 ${item.targetPathLabel || ''}
              </div>
            </div>
          </div>
        </div>`;
      });
      html += '</div>';

      selectedCount.textContent = result.processableFiles.toString();
    } else {
      html = '<div class="text-center py-8 text-gray-500">No se encontraron archivos con fechas en su nombre.</div>';
      selectedCount.textContent = '0';
    }

    previewContent.innerHTML = html;
    previewCard.classList.remove('hidden');
    this.setupDateCheckboxListeners();
    this.updateDateProcessButton();
  }

  private setupDateCheckboxListeners(): void {
    const checkboxes = document.querySelectorAll('.date-file-checkbox') as NodeListOf<HTMLInputElement>;
    const selectedCount = this.getElement('date-selected-count');
    let selectAllBtn = this.getElement('date-select-all-btn') as HTMLButtonElement;

    const updateCounts = () => {
      const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
      selectedCount.textContent = checkedCount.toString();
      const allChecked = checkedCount === checkboxes.length && checkboxes.length > 0;
      if (allChecked) {
        selectAllBtn.textContent = 'Deseleccionar todos';
      } else {
        selectAllBtn.textContent = 'Seleccionar todos';
      }
      this.updateDateProcessButton();
    };

    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', updateCounts);
    });

    selectAllBtn.replaceWith(selectAllBtn.cloneNode(true));
    selectAllBtn = this.getElement('date-select-all-btn') as HTMLButtonElement;
    selectAllBtn.addEventListener('click', () => {
      const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
      const shouldCheck = checkedCount !== checkboxes.length;
      checkboxes.forEach(checkbox => {
        checkbox.checked = shouldCheck;
      });
      updateCounts();
    });

    updateCounts();
  }

  private async startDateProcessing(): Promise<void> {
    if (this.dateIsProcessing || !this.dateInputPath) {
      return;
    }

    const checkboxes = document.querySelectorAll('.date-file-checkbox:checked') as NodeListOf<HTMLInputElement>;
    const selectedFiles = Array.from(checkboxes).map(cb => cb.dataset.filename).filter(Boolean);

    if (selectedFiles.length === 0) {
      const actionLabel = this.dateOperation === 'copy' ? 'copiar' : 'mover';
      this.showDateError(`Selecciona al menos un archivo para ${actionLabel}`);
      return;
    }

    const operationUsed = this.dateOperation;

    this.dateIsProcessing = true;
    this.updateDateProcessButton();

    this.getElement('date-progress-card').classList.remove('hidden');
    this.getElement('date-results-card').classList.add('hidden');

    try {
      const result = await this.electronAPI.startDateProcessing(
        this.dateInputPath,
        selectedFiles,
        operationUsed
      );

      if (result.success) {
        this.showDateResults(result, operationUsed);
        await this.handleAutoOpenDestinations(result.destinations);
        await this.previewDateFiles();
      } else {
        const actionLabel = operationUsed === 'copy' ? 'copiar' : 'mover';
        this.showDateError(result.error || `Error desconocido al ${actionLabel} archivos`);
      }
    } catch (error) {
      console.error('Error during date processing:', error);
      const actionLabel = operationUsed === 'copy' ? 'copiar' : 'mover';
      this.showDateError(`Error inesperado al ${actionLabel} archivos`);
    } finally {
      this.dateIsProcessing = false;
      this.updateDateProcessButton();
      this.getElement('date-progress-card').classList.add('hidden');
    }
  }

  private updateDateProgress(progress: any): void {
    const progressBar = this.getElement('date-progress-bar') as HTMLElement;
    const progressText = this.getElement('date-progress-text') as HTMLElement;
    const progressPercentage = this.getElement('date-progress-percentage') as HTMLElement;
    const currentFile = this.getElement('date-current-file') as HTMLElement;
    const processedCount = this.getElement('date-processed-count') as HTMLElement;
    const totalCount = this.getElement('date-total-count') as HTMLElement;

    progressBar.style.width = `${progress.percentage}%`;
    progressText.textContent = progress.status;
    progressPercentage.textContent = `${Math.round(progress.percentage)}%`;
    currentFile.textContent = progress.currentFile || '-';
    processedCount.textContent = progress.current.toString();
    totalCount.textContent = progress.total.toString();
  }

  private showDateResults(result: any, operation: 'move' | 'copy'): void {
    const resultsCard = this.getElement('date-results-card');
    const resultsContent = this.getElement('date-results-content');

    let html = '<div class="space-y-2">';

    if (result.processed) {
      html += `<div class="flex items-center text-green-600">
        <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
        </svg>
        ${operation === 'copy' ? 'Archivos copiados correctamente' : 'Archivos movidos correctamente'}
      </div>`;
      html += `<div class="text-sm text-gray-600">Archivos procesados: ${result.processed}</div>`;
    }

    if (result.errors && result.errors.length > 0) {
      html += '<div class="mt-4">';
      html += '<h4 class="text-sm font-medium text-red-600 mb-2">Archivos con problemas:</h4>';
      html += '<ul class="text-sm text-red-500 space-y-1">';
      result.errors.forEach((error: string) => {
        html += `<li>• ${error}</li>`;
      });
      html += '</ul></div>';
    }

    html += '</div>';

    resultsContent.innerHTML = html;
    resultsCard.classList.remove('hidden');
  }

  private showDateError(message: string): void {
    const resultsCard = this.getElement('date-results-card');
    const resultsContent = this.getElement('date-results-content');

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
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    new ArchidropApp();
  } catch (error) {
    console.error('Failed to initialize ArchidropApp:', error);
  }
});