import * as fs from 'fs-extra';
import * as path from 'path';
import { spawn } from 'child_process';

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
  reason?: string;
  parsedInfo?: FileInfo;
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
  dropboxPath: string
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

    if (!await fs.pathExists(dropboxPath)) {
      throw new Error(`La carpeta de Dropbox no existe: ${dropboxPath}`);
    }

    // Always use Dropbox/Archivos as destination
    const archivosPath = path.join(dropboxPath, 'Archivos');

    // Get all files in input directory
    const allFiles = await getAllFiles(inputPath);
    result.totalFiles = allFiles.length;

    // Filter only supported archives and analyze each one
    for (const file of allFiles) {
      const fileName = path.basename(file);
      const extension = path.extname(fileName).toLowerCase();
      const supportedExtensions = ['.zip', '.rar', '.7z'];

      const item: PreviewItem = {
        fileName,
        willProcess: false
      };

      if (!supportedExtensions.includes(extension)) {
        item.reason = `Extensión no soportada: ${extension}`;
      } else {
        // Try to parse the filename
        const fileInfo = parseFileName(fileName);
        if (fileInfo) {
          const monthNames = [
            '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
          ];
          
          const monthName = monthNames[fileInfo.month];
          const monthFolder = `${fileInfo.month.toString().padStart(2, '0')} - ${monthName}`;
          
          const targetPath = path.join(
            archivosPath,
            fileInfo.year.toString(),
            monthFolder,
            fileInfo.diary
          );

          item.willProcess = true;
          item.targetPath = targetPath;
          item.parsedInfo = fileInfo;
          result.processableFiles++;
        } else {
          item.reason = 'No se pudo identificar fecha/diario en el nombre del archivo';
        }
      }

      result.items.push(item);
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
  dropboxPath: string, 
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

    if (!await fs.pathExists(dropboxPath)) {
      throw new Error(`La carpeta de Dropbox no existe: ${dropboxPath}`);
    }

    // Always use Dropbox/Archivos as destination
    const archivosPath = path.join(dropboxPath, 'Archivos');

    // Get all files in input directory
    const files = await getFilesToProcess(inputPath);
    
    if (files.length === 0) {
      throw new Error('No se encontraron archivos para procesar');
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
        await processFile(file, archivosPath);
        result.processed++;
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
      if (supportedExtensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function processFile(filePath: string, archivosPath: string): Promise<void> {
  const fileName = path.basename(filePath, path.extname(filePath));
  const tempDir = path.join(archivosPath, 'temp', fileName);
  
  try {
    // Create temporary directory
    await fs.ensureDir(tempDir);
    
    // Extract the file
    await extractFile(filePath, tempDir);
    
    // Process extracted contents
    await organizeExtractedFiles(tempDir, archivosPath);
    
    // Clean up temporary directory
    await fs.remove(tempDir);
    
  } catch (error) {
    // Clean up on error
    if (await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
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

async function organizeExtractedFiles(tempDir: string, archivosPath: string): Promise<void> {
  const files = await fs.readdir(tempDir);
  
  for (const file of files) {
    const filePath = path.join(tempDir, file);
    const stat = await fs.stat(filePath);
    
    if (stat.isFile()) {
      // Try to determine the date and diary name from filename
      const fileInfo = parseFileName(file);
      
      if (fileInfo) {
        // Create month name in Spanish
        const monthNames = [
          '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        
        const monthName = monthNames[fileInfo.month];
        const monthFolder = `${fileInfo.month.toString().padStart(2, '0')} - ${monthName}`;
        
        // Create directory structure: YYYY > MM - MonthName > DiaryName
        const targetDir = path.join(
          archivosPath,
          fileInfo.year.toString(),
          monthFolder,
          fileInfo.diary
        );
        
        console.log(`Creating directory structure: ${targetDir}`);
        await fs.ensureDir(targetDir);
        const targetPath = path.join(targetDir, file);
        
        console.log(`Moving file from ${filePath} to ${targetPath}`);
        // Move the file to the organized location
        await fs.move(filePath, targetPath, { overwrite: true });
      } else {
        // If we can't parse the filename, put it in an "unknown" folder
        const unknownDir = path.join(dropboxPath, 'unknown');
        await fs.ensureDir(unknownDir);
        const targetPath = path.join(unknownDir, file);
        await fs.move(filePath, targetPath, { overwrite: true });
      }
    }
  }
}

interface FileInfo {
  year: number;
  month: number;
  diary: string;
}

function parseFileName(fileName: string): FileInfo | null {
  console.log(`Parsing filename: ${fileName}`);
  
  // Remove file extension for better parsing
  const nameWithoutExt = fileName.replace(/\.[^.]*$/, '');
  
  // Specific patterns for "La Tercera" and "TV Grama" nomenclature
  const patterns = [
    // Pattern: "La Tercera - 11 de diciembre de 1989"
    /^(.+?)\s*-\s*(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})$/i,
    
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
    
    if (match) {
      let year: number = 0;
      let month: number = 0;
      let diary: string = '';
      
      if (i === 0) {
        // Pattern: "La Tercera - 11 de diciembre de 1989"
        diary = match[1].trim();
        const day = parseInt(match[2], 10);
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
        
      } else if (i === 3 || i === 4) {
        // Fallback patterns: YYYY-MM-DD formats
        year = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        diary = match[4] || match[3] || '';
        
        console.log(`Parsed fallback pattern: diary="${diary}", month=${month}, year=${year}`);
        
      } else if (i === 5) {
        // Pattern: DiaryName_YYYY-MM-DD
        diary = match[1] || '';
        year = parseInt(match[2], 10);
        month = parseInt(match[3], 10);
        
        console.log(`Parsed pattern 6: diary="${diary}", month=${month}, year=${year}`);
      }
      
      // Validate date and diary name
      if (year >= 1900 && year <= new Date().getFullYear() && 
          month >= 1 && month <= 12 && diary && diary.trim().length > 0) {
        
        const result = { 
          year, 
          month, 
          diary: diary.trim()
        };
        
        console.log(`Successfully parsed: ${JSON.stringify(result)}`);
        return result;
      } else {
        console.log(`Validation failed: year=${year}, month=${month}, diary="${diary}"`);
      }
    }
  }

  console.log(`Could not parse filename: ${fileName}`);
  return null;
}