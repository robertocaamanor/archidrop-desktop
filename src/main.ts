import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import Store from 'electron-store';

const store = new Store();

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    height: 800,
    width: 1200,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    titleBarStyle: 'default',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Helper function to get Dropbox path
function getDropboxPath(): string {
  const userProfile = os.homedir();
  return path.join(userProfile, 'Dropbox');
}

// Helper function to get Downloads path
function getDownloadsPath(): string {
  return app.getPath('downloads');
}

// IPC handlers for file operations
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Seleccionar carpeta de archivos'
  });
  
  return result;
});

ipcMain.handle('get-downloads-path', () => {
  return { path: getDownloadsPath() };
});

ipcMain.handle('get-dropbox-path', () => {
  return { path: getDropboxPath() };
});

ipcMain.handle('get-settings', () => {
  return store.get('settings', {
    dropboxPath: '',
    lastInputPath: '',
    autoOpen: false,
    useDateFolder: false
  });
});

ipcMain.handle('save-settings', (event, settings) => {
  store.set('settings', settings);
  return true;
});

ipcMain.handle('preview-files', async (event, inputPath: string, useDateFolder: boolean = false) => {
  try {
    const { previewFiles } = await import('./services/fileProcessor');
    return await previewFiles(inputPath, useDateFolder);
  } catch (error) {
    console.error('Error previewing files:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
});

ipcMain.handle('start-zip-processing', async (event, inputPath: string, selectedFiles: string[], deleteOriginals: boolean, useDateFolder: boolean = false) => {
  try {
    // Import the processing logic
    const { processFiles } = await import('./services/fileProcessor');
    
    return await processFiles(inputPath, selectedFiles, deleteOriginals, useDateFolder, (progress) => {
      event.sender.send('zip-processing-progress', progress);
    });
  } catch (error) {
    console.error('Error processing files:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
});

ipcMain.handle('preview-date-files', async (event, inputPath: string) => {
  try {
    const { previewDateFiles } = await import('./services/fileProcessor');
    return await previewDateFiles(inputPath);
  } catch (error) {
    console.error('Error previewing date files:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
});

ipcMain.handle('start-date-processing', async (event, inputPath: string, selectedFiles: string[], operation: 'move' | 'copy' = 'move') => {
  try {
    const { organizeFilesByDate } = await import('./services/fileProcessor');
    return await organizeFilesByDate(inputPath, selectedFiles, operation, (progress) => {
      event.sender.send('date-processing-progress', progress);
    });
  } catch (error) {
    console.error('Error organizing files by date:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
});

ipcMain.handle('open-path', async (_event, targetPath: string) => {
  try {
    if (!targetPath) {
      return { success: false, error: 'Ruta de destino no válida' };
    }

    const result = await shell.openPath(targetPath);
    if (result) {
      console.warn(`shell.openPath returned message: ${result}`);
      return { success: false, error: result };
    }

    return { success: true };
  } catch (error) {
    console.error('Error opening destination path:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
});