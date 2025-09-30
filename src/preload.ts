import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  previewFiles: (inputPath: string) =>
    ipcRenderer.invoke('preview-files', inputPath),
  startProcessing: (inputPath: string) => 
    ipcRenderer.invoke('start-processing', inputPath),
  
  // Listen for processing progress updates
  onProcessingProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('processing-progress', (event, progress) => callback(progress));
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});