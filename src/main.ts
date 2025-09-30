import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs-extra';
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

// IPC handlers for file operations
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Seleccionar carpeta de archivos'
  });
  
  return result;
});

ipcMain.handle('select-dropbox-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Seleccionar carpeta de Dropbox'
  });
  
  return result;
});

ipcMain.handle('get-settings', () => {
  return store.get('settings', {
    dropboxPath: '',
    lastInputPath: '',
    autoOpen: false
  });
});

ipcMain.handle('save-settings', (event, settings) => {
  store.set('settings', settings);
  return true;
});

ipcMain.handle('preview-files', async (event, inputPath: string, dropboxPath: string) => {
  try {
    const { previewFiles } = await import('./services/fileProcessor');
    return await previewFiles(inputPath, dropboxPath);
  } catch (error) {
    console.error('Error previewing files:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
});

ipcMain.handle('start-processing', async (event, inputPath: string, dropboxPath: string) => {
  try {
    // Import the processing logic
    const { processFiles } = await import('./services/fileProcessor');
    
    return await processFiles(inputPath, dropboxPath, (progress) => {
      event.sender.send('processing-progress', progress);
    });
  } catch (error) {
    console.error('Error processing files:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
});