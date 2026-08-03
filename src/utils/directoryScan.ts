// Selección de carpeta vía File System Access API.
//
// El <input webkitdirectory> obliga al navegador a enumerar TODO el árbol de la
// carpeta (incluyendo node_modules, .git, dist, vendor, etc.) antes de que
// nuestro JS pueda filtrar nada — con carpetas grandes eso por sí solo puede
// trabar el navegador. showDirectoryPicker() nos deja caminar el árbol nosotros
// mismos y saltarnos carpetas ignoradas ANTES de entrar en ellas, así sus
// archivos nunca se enumeran ni se tocan.
//
// Solo disponible en navegadores Chromium (Chrome, Edge). Los llamadores deben
// revisar supportsDirectoryPicker() y usar <input webkitdirectory> como fallback.

export const supportsDirectoryPicker = (): boolean =>
  typeof (window as any).showDirectoryPicker === 'function';

const setRelativePath = (file: File, relativePath: string): File => {
  try {
    Object.defineProperty(file, 'webkitRelativePath', {
      value: relativePath,
      writable: false,
      configurable: true
    });
  } catch {
    // Si el navegador no permite redefinir la propiedad, el path completo
    // simplemente cae de vuelta a file.name en los llamadores.
  }
  return file;
};

async function* walkDirectory(
  dirHandle: any,
  rootName: string,
  relativePath: string,
  ignoredDirNamesLower: ReadonlySet<string>
): AsyncGenerator<File> {
  for await (const entry of dirHandle.values()) {
    const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.kind === 'directory') {
      if (ignoredDirNamesLower.has(entry.name.toLowerCase())) continue;
      yield* walkDirectory(entry, rootName, entryPath, ignoredDirNamesLower);
    } else {
      try {
        const file: File = await entry.getFile();
        yield setRelativePath(file, `${rootName}/${entryPath}`);
      } catch {
        // Archivo no accesible (permisos, symlink roto, etc.): se ignora.
      }
    }
  }
}

export interface PickedProjectDirectory {
  rootName: string;
  files: File[];
}

/**
 * Abre el selector nativo de carpetas y devuelve solo los archivos que no
 * caen dentro de una carpeta ignorada. Devuelve null si el usuario cancela
 * el diálogo o si el navegador no soporta la API.
 */
export const pickProjectDirectory = async (
  ignoredDirectories: readonly string[]
): Promise<PickedProjectDirectory | null> => {
  const picker = (window as any).showDirectoryPicker;
  if (typeof picker !== 'function') return null;

  let handle: any;
  try {
    handle = await picker({ mode: 'read' });
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return null;
    throw err;
  }

  const ignoredSet = new Set(ignoredDirectories.map((d) => d.toLowerCase()));
  const files: File[] = [];
  for await (const file of walkDirectory(handle, handle.name, '', ignoredSet)) {
    files.push(file);
  }

  return { rootName: handle.name, files };
};
