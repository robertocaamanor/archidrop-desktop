# Archidrop Desktop

Una aplicación de escritorio moderna para organizar automáticamente archivos de diarios digitalizados. Archidrop Desktop transforma la herramienta de línea de comandos original en una interfaz gráfica intuitiva construida con Electron, TypeScript y TailwindCSS.

## Características

- 🖱️ **Interfaz gráfica intuitiva** - Fácil selección de carpetas y configuración
- 📁 **Organización automática** - Organiza archivos por año/mes/diario
- 📦 **Soporte multi-formato** - Compatible con archivos ZIP, RAR y 7Z
- 🔄 **Progreso en tiempo real** - Barra de progreso y estado de procesamiento
- ⚙️ **Configuración persistente** - Guarda tus preferencias automáticamente
- 🎨 **Interfaz moderna** - Diseño limpio con TailwindCSS

## Tecnologías

- **Electron** - Framework para aplicaciones de escritorio multiplataforma
- **TypeScript** - Tipado estático para mayor robustez
- **TailwindCSS** - Framework CSS utilitario para diseño moderno
- **Node.js** - Runtime para el procesamiento de archivos

## Requisitos del Sistema

- Node.js 16 o superior
- 7-Zip instalado en el sistema (para extracción de archivos)
- Windows, macOS o Linux

## Instalación

1. Clona o descarga el proyecto
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Compila el proyecto:
   ```bash
   npm run build
   ```
4. Compila los estilos CSS:
   ```bash
   npm run build-css
   ```

## Desarrollo

Para desarrollar la aplicación:

1. Inicia el modo de desarrollo:
   ```bash
   npm run dev
   ```

Esto iniciará TypeScript en modo watch y ejecutará Electron automáticamente.

## Scripts Disponibles

- `npm run build` - Compila TypeScript a JavaScript
- `npm run build:watch` - Compila TypeScript en modo watch
- `npm run start` - Ejecuta la aplicación (requiere compilación previa)
- `npm run dev` - Modo desarrollo con recarga automática
- `npm run build-css` - Compila estilos CSS con Tailwind
- `npm run pack` - Empaqueta la aplicación
- `npm run dist` - Genera distribución de la aplicación

## Uso

1. **Seleccionar carpeta de archivos**: Elige la carpeta que contiene los archivos comprimidos a procesar
2. **Seleccionar carpeta de Dropbox**: Elige la carpeta de destino donde se organizarán los archivos
3. **Iniciar procesamiento**: Haz clic en el botón para comenzar el procesamiento automático
4. **Monitorear progreso**: Observa el progreso en tiempo real con detalles del archivo actual

## Estructura del Proyecto

```
archidrop-desktop/
├── src/
│   ├── main.ts              # Proceso principal de Electron
│   ├── preload.ts           # Script preload para seguridad
│   ├── renderer/
│   │   ├── index.html       # Interfaz principal
│   │   └── renderer.ts      # Lógica del renderer
│   ├── services/
│   │   └── fileProcessor.ts # Lógica de procesamiento de archivos
│   └── styles/
│       └── input.css        # Estilos CSS con Tailwind
├── dist/                    # Archivos compilados
├── package.json
├── tsconfig.json
└── tailwind.config.js
```

## Configuración de 7-Zip

### Windows
1. Descargar e instalar 7-Zip desde https://www.7-zip.org/
2. Asegúrate de que `7z.exe` esté en el PATH del sistema

### macOS
```bash
brew install p7zip
```

### Linux (Ubuntu/Debian)
```bash
sudo apt-get install p7zip-full
```

## Construir para Distribución

Para generar ejecutables distribuibles:

```bash
npm run dist
```

Esto generará archivos de instalación en la carpeta `release/` para tu plataforma actual.

## Contribuir

1. Fork el proyecto
2. Crea una rama para tu característica (`git checkout -b feature/nueva-caracteristica`)
3. Commit tus cambios (`git commit -am 'Añadir nueva característica'`)
4. Push a la rama (`git push origin feature/nueva-caracteristica`)
5. Crea un Pull Request

## Licencia

MIT License - ver el archivo LICENSE para más detalles.

## Autor

Roberto Caamaño

---

**Nota**: Esta aplicación está basada en la herramienta original Archidrop de línea de comandos y la transforma en una experiencia de usuario moderna y fácil de usar.