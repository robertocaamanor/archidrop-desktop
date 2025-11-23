import * as fs from 'fs-extra';
import * as path from 'path';
import { spawn } from 'child_process';
import * as os from 'os';

const MONTH_NAMES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTH_NAMES_LOWER = [
  '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

// Helper function to get Dropbox path
function getDropboxPath(): string {
  const userProfile = os.homedir();
  return path.join(userProfile, 'Dropbox');
}

// Helper function to safely remove directory with retries
async function safeRemoveDir(dirPath: string, maxRetries: number = 5): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (await fs.pathExists(dirPath)) {
        // First, try to ensure all files are moved out
        const files = await fs.readdir(dirPath);
        if (files.length > 0) {
          console.warn(`Directory ${dirPath} still contains ${files.length} files on attempt ${attempt}`);
        }
        
        await fs.remove(dirPath);
        console.log(`Successfully removed directory: ${dirPath}`);
      }
      return; // Success
    } catch (error) {
      console.warn(`Attempt ${attempt} to remove ${dirPath} failed:`, error);
      
      if (attempt === maxRetries) {
        console.error(`Failed to remove directory after ${maxRetries} attempts: ${dirPath}`);
        // Don't throw error, just log it to avoid stopping the entire process
        return;
      }
      
      // Wait before retry with longer delays for Windows file handle issues
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
}

export interface ProcessingProgress {
  current: number;
  total: number;
  currentFile: string;
  status: string;
  percentage: number;
}

export interface ProcessingResult {
  success: boolean;
  processed: number;
  errors: string[];
  error?: string;
}

type ProgressCallback = (progress: ProcessingProgress) => void;

export interface PreviewItem {
  fileName: string;
  willProcess: boolean;
  targetPath?: string;
  targetPathLabel?: string;
  reason?: string;
  parsedInfo?: FileInfo;
  dateFolderName?: string;
}

export interface PreviewResult {
  success: boolean;
  items: PreviewItem[];
  totalFiles: number;
  processableFiles: number;
  error?: string;
}

export async function previewFiles(
  inputPath: string,
  useDateFolder: boolean
): Promise<PreviewResult> {
  const result: PreviewResult = {
    success: false,
    items: [],
    totalFiles: 0,
    processableFiles: 0
  };

  try {
    // Validate input paths
    if (!await fs.pathExists(inputPath)) {
      throw new Error(`La carpeta de entrada no existe: ${inputPath}`);
    }

    // Get Dropbox path and use Archivos folder as destination
    const dropboxPath = getDropboxPath();
    if (!await fs.pathExists(dropboxPath)) {
      throw new Error(`La carpeta de Dropbox no existe: ${dropboxPath}`);
    }

    // Always use Dropbox/Archivos as destination
    const archivosPath = path.join(dropboxPath, 'Archivos');

    // Get all files in input directory
    const allFiles = await getAllFiles(inputPath);
    result.totalFiles = allFiles.length;

    // Filter only supported archives that can be processed
    for (const file of allFiles) {
      const fileName = path.basename(file);
      const extension = path.extname(fileName).toLowerCase();
      const supportedExtensions = ['.zip', '.rar', '.7z'];

      // Only process files with supported extensions and valid nomenclature
      if (supportedExtensions.includes(extension)) {
        const fileInfo = parseFileName(fileName);
        if (fileInfo) {
          const targetInfo = buildTargetInfo(archivosPath, fileInfo, useDateFolder);

          const item: PreviewItem = {
            fileName,
            willProcess: true,
            targetPath: targetInfo.fullPath,
            targetPathLabel: targetInfo.label,
            parsedInfo: fileInfo,
            dateFolderName: targetInfo.dateFolderName
          };

          result.items.push(item);
          result.processableFiles++;
        }
      }
    }

    result.success = true;
    return result;

  } catch (error) {
    console.error('Error in previewFiles:', error);
    result.error = error instanceof Error ? error.message : 'Error desconocido';
    return result;
  }
}

async function getAllFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  // Only scan the main directory, not subdirectories
  const items = await fs.readdir(dirPath);
  
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = await fs.stat(fullPath);
    
    if (stat.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function processFiles(
  inputPath: string, 
  selectedFiles: string[],
  deleteOriginals: boolean,
  useDateFolder: boolean,
  onProgress: ProgressCallback
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    success: false,
    processed: 0,
    errors: []
  };

  try {
    // Validate input paths
    if (!await fs.pathExists(inputPath)) {
      throw new Error(`La carpeta de entrada no existe: ${inputPath}`);
    }

    // Get Dropbox path and validate
    const dropboxPath = getDropboxPath();
    if (!await fs.pathExists(dropboxPath)) {
      throw new Error(`La carpeta de Dropbox no existe: ${dropboxPath}`);
    }

    // Always use Dropbox/Archivos as destination
    const archivosPath = path.join(dropboxPath, 'Archivos');

    // Get all files in input directory
    const allFiles = await getFilesToProcess(inputPath);
    
    // Filter only selected files
    const files = allFiles.filter(filePath => {
      const fileName = path.basename(filePath);
      return selectedFiles.includes(fileName);
    });
    
    if (files.length === 0) {
      throw new Error('No se encontraron archivos seleccionados para procesar');
    }

    onProgress({
      current: 0,
      total: files.length,
      currentFile: '',
      status: 'Iniciando procesamiento...',
      percentage: 0
    });

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = path.basename(file);
      
      onProgress({
        current: i,
        total: files.length,
        currentFile: fileName,
        status: 'Procesando archivo...',
        percentage: (i / files.length) * 100
      });

      try {
        await processFile(file, archivosPath, useDateFolder);
        result.processed++;
        
        // Delete original file if processing was successful and option is enabled
        if (deleteOriginals) {
          try {
            await fs.remove(file);
            console.log(`Deleted original file: ${fileName}`);
          } catch (deleteError) {
            console.error(`Error deleting original file ${fileName}:`, deleteError);
            result.errors.push(`Advertencia: No se pudo eliminar el archivo original ${fileName}`);
          }
        }
      } catch (error) {
        console.error(`Error processing file ${fileName}:`, error);
        result.errors.push(`Error procesando ${fileName}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      }
    }

    onProgress({
      current: files.length,
      total: files.length,
      currentFile: '',
      status: 'Procesamiento completado',
      percentage: 100
    });

    result.success = true;
    return result;

  } catch (error) {
    console.error('Error in processFiles:', error);
    result.error = error instanceof Error ? error.message : 'Error desconocido';
    return result;
  }
}

async function getFilesToProcess(inputPath: string): Promise<string[]> {
  const files: string[] = [];
  const supportedExtensions = ['.zip', '.rar', '.7z'];

  // Only scan the main directory, not subdirectories
  const items = await fs.readdir(inputPath);
  
  for (const item of items) {
    const fullPath = path.join(inputPath, item);
    const stat = await fs.stat(fullPath);
    
    if (stat.isFile()) {
      const ext = path.extname(item).toLowerCase();
      
      // Check if file has supported extension
      if (supportedExtensions.includes(ext)) {
        // Also check if filename matches our nomenclature pattern
        const fileNameWithoutExt = path.basename(item, ext);
        const parsedInfo = parseFileName(fileNameWithoutExt);
        
        // Only include files that match the nomenclature pattern
        if (parsedInfo) {
          files.push(fullPath);
        }
      }
    }
  }

  return files;
}

async function processFile(filePath: string, archivosPath: string, useDateFolder: boolean): Promise<void> {
  const fileName = path.basename(filePath, path.extname(filePath));
  const tempDir = path.join(archivosPath, 'temp', fileName);
  
  // Parse the original filename to get organization info
  const fileInfo = parseFileName(fileName);
  
  if (!fileInfo) {
    throw new Error(`No se pudo parsear el nombre del archivo: ${fileName}`);
  }
  
  try {
    // Create temporary directory
    await fs.ensureDir(tempDir);
    
    // Extract the file
    await extractFile(filePath, tempDir);
    
    // Add delay to ensure extraction is complete and file handles are released
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify extraction was successful
    const extractedFiles = await fs.readdir(tempDir);
    if (extractedFiles.length === 0) {
      throw new Error('No se extrajeron archivos del archivo comprimido');
    }
    
    console.log(`Extracted ${extractedFiles.length} items from ${path.basename(filePath)}`);
    
    // Process extracted contents using the parsed info from original filename
    await organizeExtractedFiles(tempDir, archivosPath, fileInfo, useDateFolder);
    
    // Add delay to ensure all file operations are complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Clean up temporary directory with retries
    await safeRemoveDir(tempDir);
    
  } catch (error) {
    // Clean up on error with retries
    await safeRemoveDir(tempDir);
    throw error;
  }
}

async function extractFile(filePath: string, outputDir: string): Promise<void> {
  const extension = path.extname(filePath).toLowerCase();
  
  if (extension === '.zip') {
    return extractZipFile(filePath, outputDir);
  } else if (extension === '.rar' || extension === '.7z') {
    return extractWithPowerShell(filePath, outputDir);
  } else {
    throw new Error(`Formato de archivo no soportado: ${extension}`);
  }
}

async function extractZipFile(filePath: string, outputDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use PowerShell's Expand-Archive for ZIP files (available on Windows 10+)
    const command = 'powershell.exe';
    const args = [
      '-Command',
      `Expand-Archive -Path "${filePath}" -DestinationPath "${outputDir}" -Force`
    ];

    const childProcess = spawn(command, args, {
      windowsHide: true
    });

    let stderr = '';
    
    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    childProcess.on('close', (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Error al extraer archivo ZIP: ${stderr || 'código de salida ' + code}`));
      }
    });

    childProcess.on('error', (error: Error) => {
      reject(new Error(`Error ejecutando comando de extracción ZIP: ${error.message}`));
    });
  });
}

async function extractWithPowerShell(filePath: string, outputDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Try to use 7z if available, otherwise show informative error
    const command = '7z';
    const args = ['x', filePath, `-o${outputDir}`, '-y'];

    const childProcess = spawn(command, args, {
      windowsHide: true
    });
    
    childProcess.on('close', (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Error al extraer archivo: código de salida ${code}`));
      }
    });

    childProcess.on('error', (error: Error) => {
      if (error.message.includes('ENOENT')) {
        reject(new Error(`Para extraer archivos .rar y .7z necesitas instalar 7-Zip desde https://www.7-zip.org/`));
      } else {
        reject(new Error(`Error ejecutando comando de extracción: ${error.message}`));
      }
    });
  });
}

async function organizeExtractedFiles(tempDir: string, archivosPath: string, fileInfo: FileInfo, useDateFolder: boolean): Promise<void> {
  const files = await fs.readdir(tempDir);
  
  // Create month name in Spanish
  const targetInfo = buildTargetInfo(archivosPath, fileInfo, useDateFolder);
  const targetDir = targetInfo.fullPath;
  
  console.log(`Creating directory structure: ${targetDir}`);
  await fs.ensureDir(targetDir);
  
  for (const file of files) {
    const filePath = path.join(tempDir, file);
    const stat = await fs.stat(filePath);
    
    if (stat.isFile()) {
      const targetPath = path.join(targetDir, file);
      
      console.log(`Moving file from ${filePath} to ${targetPath}`);
      // Move the file to the organized location
      await fs.move(filePath, targetPath, { overwrite: true });
    } else if (stat.isDirectory()) {
      // If it's a directory, move it recursively
      const targetDirPath = path.join(targetDir, file);
      console.log(`Moving directory from ${filePath} to ${targetDirPath}`);
      await fs.move(filePath, targetDirPath, { overwrite: true });
    }
  }
}

interface FileInfo {
  year: number;
  month: number;
  diary: string;
  day?: number;
}

function parseFileName(fileName: string): FileInfo | null {
  console.log(`Parsing filename: ${fileName}`);
  
  // Remove file extension for better parsing
  const nameWithoutExt = fileName.replace(/\.[^.]*$/, '');
  
  // Specific patterns for "La Tercera" and "TV Grama" nomenclature
  const patterns = [
    // Pattern: "La Tercera - 11 de diciembre de 1989" or "La Tercera - 11 de diciembre del 1989"
    /^(.+?)\s*-\s*(\d{1,2})\s+de\s+(\w+)\s+(?:de|del)\s+(\d{4})$/i,
    
    // Pattern: "TV Grama - Diciembre 1989"
    /^(.+?)\s*-\s*(\w+)\s+(\d{4})$/i,
    
    // Pattern: "La Tercera - diciembre 1989" (alternative)
    /^(.+?)\s*-\s*(\w+)\s+(\d{4})$/i,
    
    // Fallback patterns for other formats
    /(\d{4})[_-](\d{1,2})[_-](\d{1,2})[_-](.+)/,  // YYYY-MM-DD_DiaryName
    /(\d{4})(\d{2})(\d{2})[_-](.+)/,               // YYYYMMDD_DiaryName
    /(.+)[_-](\d{4})[_-](\d{1,2})[_-](\d{1,2})/,  // DiaryName_YYYY-MM-DD
  ];

  // Spanish month names mapping
  const spanishMonths: { [key: string]: number } = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
    'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
    'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12,
    'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4,
    'may': 5, 'jun': 6, 'jul': 7, 'ago': 8,
    'sep': 9, 'oct': 10, 'nov': 11, 'dic': 12
  };

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const match = nameWithoutExt.match(pattern);
    
    if (!match) {
      continue;
    }

    let year = 0;
    let month = 0;
    let diary = '';
    let day: number | null = null;
    
    if (i === 0) {
      // Pattern: "La Tercera - 11 de diciembre de 1989"
      diary = match[1].trim();
      day = parseInt(match[2], 10);
      const monthName = match[3].toLowerCase();
      year = parseInt(match[4], 10);
      month = spanishMonths[monthName] || 0;
      
      console.log(`Parsed pattern 1: diary="${diary}", day=${day}, month="${monthName}"(${month}), year=${year}`);
    } else if (i === 1 || i === 2) {
      // Pattern: "TV Grama - Diciembre 1989"
      diary = match[1].trim();
      const monthName = match[2].toLowerCase();
      year = parseInt(match[3], 10);
      month = spanishMonths[monthName] || 0;
      
      console.log(`Parsed pattern 2/3: diary="${diary}", month="${monthName}"(${month}), year=${year}`);
    } else if (i === 3) {
      // Pattern: YYYY-MM-DD_DiaryName
      year = parseInt(match[1], 10);
      month = parseInt(match[2], 10);
      day = parseInt(match[3], 10);
      diary = (match[4] || '').trim();
      
      console.log(`Parsed fallback pattern 4: diary="${diary}", day=${day}, month=${month}, year=${year}`);
    } else if (i === 4) {
      // Pattern: YYYYMMDD_DiaryName
      year = parseInt(match[1], 10);
      month = parseInt(match[2], 10);
      day = parseInt(match[3], 10);
      diary = (match[4] || '').trim();
      
      console.log(`Parsed fallback pattern 5: diary="${diary}", day=${day}, month=${month}, year=${year}`);
    } else if (i === 5) {
      // Pattern: DiaryName_YYYY-MM-DD
      diary = (match[1] || '').trim();
      year = parseInt(match[2], 10);
      month = parseInt(match[3], 10);
      day = parseInt(match[4], 10);
      
      console.log(`Parsed pattern 6: diary="${diary}", day=${day}, month=${month}, year=${year}`);
    }

    const validYear = year >= 1900 && year <= new Date().getFullYear();
    const validMonth = month >= 1 && month <= 12;
    const validDiary = diary && diary.trim().length > 0;
    const validDay = day === null || (day >= 1 && day <= 31);

    if (validYear && validMonth && validDiary && validDay) {
      const result: FileInfo = {
        year,
        month,
        diary: diary.trim()
      };

      if (day !== null && validDay) {
        result.day = day;
      }

      console.log(`Successfully parsed: ${JSON.stringify(result)}`);
      return result;
    }

    console.log(`Validation failed: year=${year}, month=${month}, day=${day}, diary="${diary}"`);
  }

  console.log(`Could not parse filename: ${fileName}`);
  return null;
}

interface TargetInfo {
  fullPath: string;
  label: string;
  dateFolderName?: string;
}

function buildTargetInfo(archivosPath: string, fileInfo: FileInfo, useDateFolder: boolean): TargetInfo {
  const monthFolder = getMonthFolderName(fileInfo.month);
  const baseTarget = path.join(
    archivosPath,
    fileInfo.year.toString(),
    monthFolder,
    fileInfo.diary
  );

  let fullPath = baseTarget;
  let dateFolderName: string | undefined;

  if (useDateFolder) {
    const candidate = getDateFolderName(fileInfo);
    if (candidate) {
      dateFolderName = candidate;
      fullPath = path.join(baseTarget, candidate);
    }
  }

  const labelParts = [fileInfo.year.toString(), monthFolder, fileInfo.diary];
  if (dateFolderName) {
    labelParts.push(dateFolderName);
  }

  return {
    fullPath,
    label: labelParts.join(' / '),
    dateFolderName
  };
}

function getMonthFolderName(month: number): string {
  if (month >= 1 && month <= 12) {
    return `${month.toString().padStart(2, '0')} - ${MONTH_NAMES[month]}`;
  }
  const safeMonth = Math.max(0, Math.min(month, 99));
  return `${safeMonth.toString().padStart(2, '0')} - Mes`;
}

function getDateFolderName(fileInfo: FileInfo): string | undefined {
  const month = fileInfo.month;
  const year = fileInfo.year;

  if (!(month >= 1 && month <= 12) || year <= 0) {
    return undefined;
  }

  const monthNameLower = MONTH_NAMES_LOWER[month];
  if (!monthNameLower) {
    return undefined;
  }

  if (fileInfo.day && fileInfo.day >= 1 && fileInfo.day <= 31) {
    return `${fileInfo.day} de ${monthNameLower} de ${year}`;
  }

  const monthNameCapitalized = monthNameLower.charAt(0).toUpperCase() + monthNameLower.slice(1);
  return `${monthNameCapitalized} de ${year}`;
}