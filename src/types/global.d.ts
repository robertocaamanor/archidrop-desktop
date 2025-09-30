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
  selectDropboxFolder: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  getSettings: () => Promise<any>;
  saveSettings: (settings: any) => Promise<boolean>;
  startProcessing: (inputPath: string, dropboxPath: string) => Promise<any>;
  onProcessingProgress: (callback: (progress: ProcessingProgress) => void) => void;
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};