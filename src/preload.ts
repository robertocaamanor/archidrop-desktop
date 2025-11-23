import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),
  getDropboxPath: () => ipcRenderer.invoke('get-dropbox-path'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  previewFiles: (inputPath: string, useDateFolder: boolean = false) =>
    ipcRenderer.invoke('preview-files', inputPath, useDateFolder),
  startProcessing: (inputPath: string, selectedFiles: string[], deleteOriginals: boolean, useDateFolder: boolean = false) => 
    ipcRenderer.invoke('start-processing', inputPath, selectedFiles, deleteOriginals, useDateFolder),
  
  // Listen for processing progress updates
  onProcessingProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('processing-progress', (event, progress) => callback(progress));
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});