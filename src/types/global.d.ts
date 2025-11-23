// Global type declarations for the renderer process

export interface ProcessingProgress {
  current: number;
  total: number;
  currentFile: string;
  status: string;
  percentage: number;
}

export interface ElectronAPI {
  selectFolder: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  getDownloadsPath: () => Promise<{ path: string }>;
  getDropboxPath: () => Promise<{ path: string }>;
  getSettings: () => Promise<any>;
  saveSettings: (settings: any) => Promise<boolean>;
  previewFiles: (inputPath: string, useDateFolder?: boolean) => Promise<any>;
  startProcessing: (inputPath: string, selectedFiles: string[], deleteOriginals: boolean, useDateFolder?: boolean) => Promise<any>;
  onProcessingProgress: (callback: (progress: ProcessingProgress) => void) => void;
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};