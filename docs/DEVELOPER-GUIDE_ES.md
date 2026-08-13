# Guía de Instalación y Uso — ADT Studio

ADT Studio es una aplicación de escritorio para la producción automatizada de libros digitales. Extrae contenido de archivos PDF, lo procesa mediante pipelines de LLM (modelos de lenguaje) y genera paquetes de salida formateados en HTML. Fue desarrollado para UNICEF con el objetivo de digitalizar libros de texto educativos.

---

## Tabla de Contenidos

- [Sección 1: Desarrollo Local](#sección-1-desarrollo-local)
  - [Requisitos Previos](#requisitos-previos)
  - [Pasos de Instalación](#pasos-de-instalación)
  - [Comandos Útiles](#comandos-útiles)
  - [Desarrollo de Escritorio (Electron) — Opcional](#desarrollo-de-escritorio-electron--opcional)
- [Sección 2: Docker](#sección-2-docker)
  - [Requisitos Previos (Docker)](#requisitos-previos-docker)
  - [Opción A: Imagen Combinada (Recomendado)](#opción-a-imagen-combinada-recomendado)
  - [Opción B: Docker Compose (Dos Servicios)](#opción-b-docker-compose-dos-servicios)
  - [Volúmenes y Persistencia de Datos](#volúmenes-y-persistencia-de-datos)
- [Verificación y Primeros Pasos](#verificación-y-primeros-pasos)
- [Solución de Problemas Comunes](#solución-de-problemas-comunes)
- [Notas Específicas por Sistema Operativo](#notas-específicas-por-sistema-operativo)

---

## Sección 1: Desarrollo Local

### Requisitos Previos

| Software | Versión Requerida | Notas |
|----------|-------------------|-------|
| **Git** | Cualquier versión reciente | Para clonar el repositorio. En Windows: [Git for Windows](https://gitforwindows.org/) |
| **Node.js** | **22 o superior** | Se recomienda usar un gestor de versiones (ver abajo) |
| **pnpm** | **10.32.1** | Se instala con `corepack` (incluido en Node.js) |

> **Windows:** Se recomienda usar **PowerShell** o **Git Bash** (incluido con Git for Windows) para ejecutar los comandos de esta guía. Los comandos `pnpm`, `node` y `git` funcionan en ambos. Evitar usar CMD (símbolo del sistema) ya que tiene limitaciones con rutas largas.

#### Instalar Node.js 22

##### macOS / Linux

**Opción 1 — Con `nvm` (recomendado):**

```bash
# Instalar nvm (si no lo tienes)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Instalar y usar Node.js 22
nvm install 22
nvm use 22

# Verificar versión
node --version   # Debe mostrar v22.x.x
```

**Opción 2 — Con `fnm`:**

```bash
# Instalar fnm (si no lo tienes)
curl -fsSL https://fnm.vercel.app/install | bash

# Instalar y usar Node.js 22
fnm install 22
fnm use 22
```

##### Windows

**Opción 1 — Con `fnm` (recomendado para Windows):**

```powershell
# Instalar fnm con winget
winget install Schniz.fnm

# Instalar y usar Node.js 22
fnm install 22
fnm use 22

# Verificar versión
node --version   # Debe mostrar v22.x.x
```

**Opción 2 — Con `nvm-windows`:**

Descargar el instalador desde [nvm-windows](https://github.com/coreybutler/nvm-windows/releases) y ejecutarlo. Luego:

```powershell
nvm install 22
nvm use 22
```

> **Importante:** `nvm-windows` es un proyecto diferente a `nvm` de Linux/macOS. No usar los comandos de instalación de `nvm` de Linux en Windows.

##### Todas las plataformas

**Instalación directa:**

Descargar desde [nodejs.org](https://nodejs.org/) (versión 22 LTS o superior). El instalador está disponible para Windows, macOS y Linux.

#### Instalar pnpm 10.32.1

Node.js incluye `corepack`, que permite instalar gestores de paquetes como pnpm sin instalación manual:

```bash
# Habilitar corepack (en Windows puede requerir ejecutar PowerShell como Administrador)
corepack enable

# Preparar la versión exacta de pnpm
corepack prepare pnpm@10.32.1 --activate

# Verificar
pnpm --version   # Debe mostrar 10.32.1
```

> **Windows:** Si `corepack enable` falla con un error de permisos, abrir PowerShell como Administrador (clic derecho > "Ejecutar como administrador") y ejecutar el comando nuevamente.

### Pasos de Instalación

#### 1. Clonar el repositorio

```bash
git clone https://github.com/unicef/adt-studio.git
cd adt-studio
```

#### 2. Instalar dependencias

```bash
pnpm install
```

Este comando instala todas las dependencias del monorepo (paquetes compartidos y aplicaciones).

#### 3. Instalar Playwright Chromium (para refinamiento visual)

El pipeline de ADT Studio puede usar capturas de pantalla para refinar visualmente el HTML generado. Esto requiere el navegador Chromium de Playwright:

```bash
pnpm exec playwright install chromium
```

En Linux, si faltan dependencias del sistema operativo:

```bash
pnpm exec playwright install --with-deps chromium
```

> **Nota:** Este paso es opcional si solo se desea usar el pipeline sin refinamiento visual, pero se recomienda instalarlo para tener la funcionalidad completa.

#### 4. Ejecutar en modo desarrollo

```bash
pnpm dev
```

Este comando hace lo siguiente automáticamente:

1. **Compila todos los paquetes TypeScript** (`pnpm build` se ejecuta vía el script `predev`)
2. **Inicia el servidor API** (Hono) en `http://localhost:3001`
3. **Inicia la aplicación web** (Vite + React) en `http://localhost:5173`

#### 5. Acceder a la aplicación

Abrir el navegador en **http://localhost:5173**

> **Nota sobre API Keys:** ADT Studio requiere una clave de API de OpenAI para procesar libros con LLMs. La clave se ingresa directamente desde la interfaz web de la aplicación. Alternativamente, para entornos de equipo o servidores compartidos, se puede configurar la variable de entorno `OPENAI_API_KEY` en el servidor — cuando está definida, los usuarios no necesitan ingresar la clave en la interfaz.

### Comandos Útiles

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Inicia API + Studio en modo desarrollo (compila automáticamente) |
| `pnpm dev:api` | Inicia solo el servidor API |
| `pnpm dev:studio` | Inicia solo la interfaz web (Vite) |
| `pnpm test` | Ejecuta los tests (Vitest) |
| `pnpm test:watch` | Ejecuta tests en modo watch |
| `pnpm typecheck` | Verificación de tipos TypeScript (modo estricto) |
| `pnpm lint` | Ejecuta ESLint |
| `pnpm build` | Compila todos los paquetes TypeScript |
| `pnpm pipeline` | CLI: ejecuta el pipeline completo sobre un libro |
| `pnpm pdf-extract` | CLI: extrae páginas de un PDF y genera un visor HTML |

### Desarrollo de Escritorio (Electron) — Opcional

La aplicación de escritorio usa Electron, manejada por [electron-vite](https://electron-vite.org/) en desarrollo y [electron-builder](https://www.electron.build/) para empaquetado. **No** se requiere Rust ni cadenas de herramientas nativas por sistema operativo para el código de la aplicación; basta con Node.js y pnpm.

| Software | Versión | Necesario para | Plataforma |
|----------|---------|---------------|------------|
| **Node.js** | 22.13+ | Desarrollo y empaquetado | Todas |
| **pnpm** | 10.32.1 | Desarrollo y empaquetado | Todas |
| **Java** | JDK 11+ | Solo para firmar instaladores Windows con `jsign.jar` | Windows (firmado) |
| **Apple Developer ID** | — | Solo para notarizar instaladores macOS | macOS (firmado) |

> **Nota:** El binding nativo de Electron lo gestiona pnpm automáticamente al instalar dependencias (`electron-builder install-app-deps` se ejecuta como `postinstall`).

#### Pasos para desarrollo de escritorio

```bash
# Inicia la app de escritorio con HMR para el renderer y recargas para main/preload.
# El servidor API se ejecuta dentro del proceso main de Electron — no es necesario
# correr `pnpm dev` por separado.
pnpm dev:desktop
```

#### Compilar el instalador de producción

```bash
# Empaqueta la aplicación completa (API + Studio + Electron)
pnpm build:desktop                       # todo en uno

# O por plataforma:
pnpm --filter @adt/desktop build:unpack  # carpeta sin instalador
pnpm --filter @adt/desktop build:win     # instalador NSIS para Windows
pnpm --filter @adt/desktop build:mac     # paquete DMG para macOS
pnpm --filter @adt/desktop build:linux   # AppImage para Linux
```

Los artefactos se generan en `apps/desktop/release/`.

---

## Sección 2: Docker

### Requisitos Previos (Docker)

| Software | Versión Requerida | Notas |
|----------|-------------------|-------|
| **Docker** | Engine 20+ | [Instalar Docker](https://docs.docker.com/engine/install/) |
| **Docker Compose** | v2+ | Incluido en Docker Desktop; en Linux puede requerir instalación separada |
| **Git** | Cualquier versión reciente | Solo para clonar el repositorio |

> **Nota:** No es necesario tener Node.js ni pnpm instalados para ejecutar con Docker. Todo está contenido en la imagen.
>
> **Windows:** Instalar [Docker Desktop para Windows](https://docs.docker.com/desktop/install/windows-install/). Requiere **WSL2** (Windows Subsystem for Linux 2) como backend. Docker Desktop lo configura automáticamente durante la instalación. Si WSL2 no está habilitado, seguir las [instrucciones de Microsoft](https://learn.microsoft.com/es-es/windows/wsl/install) antes de instalar Docker Desktop.

### Opción A: Imagen Combinada (Recomendado)

Esta opción ejecuta el API y la interfaz web en un solo contenedor. Es la forma más sencilla de usar ADT Studio.

#### 1. Clonar el repositorio

```bash
git clone https://github.com/unicef/adt-studio.git
cd adt-studio
```

#### 2. Construir la imagen

```bash
docker build --target app -t adt-studio .
```

> **Nota:** La primera compilación puede tardar varios minutos ya que descarga dependencias, compila TypeScript y descarga el navegador Chromium para renderizado de capturas.

#### 3. Crear el directorio para libros

```bash
# macOS / Linux / Git Bash
mkdir -p books

# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path books
```

#### 4. Ejecutar el contenedor

```bash
# macOS / Linux / Git Bash
docker run -p 8080:80 -v ./books:/app/books adt-studio

# Windows (PowerShell) — usar ruta absoluta para volúmenes
docker run -p 8080:80 -v ${PWD}/books:/app/books adt-studio

# Windows (CMD)
docker run -p 8080:80 -v %cd%/books:/app/books adt-studio
```

> **API Key del servidor:** Para configurar la clave de OpenAI a nivel de servidor (evita que cada usuario la ingrese manualmente), agregar la variable de entorno:
> ```bash
> docker run -p 8080:80 -v ./books:/app/books -e OPENAI_API_KEY=sk-... adt-studio
> ```

#### 5. Acceder a la aplicación

Abrir el navegador en **http://localhost:8080**

#### Cambiar el puerto

Para usar un puerto diferente al 8080, cambiar el primer número:

```bash
docker run -p 3000:80 -v ./books:/app/books adt-studio
```

Esto haría accesible la aplicación en `http://localhost:3000`.

### Opción B: Docker Compose (Dos Servicios)

Esta opción ejecuta el API y la interfaz web como servicios separados, conectados por una red interna. Útil para desarrollo o si se necesita escalar los servicios de forma independiente.

#### 1. Clonar el repositorio

```bash
git clone https://github.com/unicef/adt-studio.git
cd adt-studio
```

#### 2. Configurar el puerto (opcional)

```bash
# macOS / Linux / Git Bash
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env

# Editar .env si se desea cambiar el puerto (por defecto: 8080)
# PORT=8080
```

#### 3. Construir e iniciar los servicios

```bash
docker compose up --build
```

Para ejecutar en segundo plano (modo daemon):

```bash
docker compose up --build -d
```

#### 4. Acceder a la aplicación

Abrir el navegador en **http://localhost:8080** (o el puerto configurado en `.env`).

#### 5. Detener los servicios

```bash
# Si se ejecutó en primer plano: Ctrl+C

# Si se ejecutó en modo daemon:
docker compose down
```

### Volúmenes y Persistencia de Datos

| Volumen | Descripción | Requerido |
|---------|-------------|-----------|
| `./books:/app/books` | Datos de libros procesados (PDFs, imágenes, bases de datos SQLite) | **Sí** |
| `./prompts:/app/prompts` | Plantillas de prompts LLM personalizadas | No (usa las incluidas por defecto) |
| `./templates:/app/templates` | Plantillas HTML de layout personalizadas | No (usa las incluidas por defecto) |
| `./config.yaml:/app/config.yaml` | Configuración global personalizada | No (usa la incluida por defecto) |

> **Respaldo y migración:** Para respaldar o migrar un libro, copiar o comprimir el directorio `books/{label}/`. Contiene toda la información del libro (base de datos SQLite, imágenes extraídas, caché de LLM y configuración). Para migrar a otra instancia, simplemente copiar el directorio al `books/` de la nueva instalación.

**Ejemplo con volúmenes opcionales (imagen combinada):**

```bash
# macOS / Linux / Git Bash
docker run -p 8080:80 \
  -v ./books:/app/books \
  -v ./prompts:/app/prompts \
  -v ./config.yaml:/app/config.yaml:ro \
  adt-studio

# Windows (PowerShell) — usar ` en lugar de \ para continuación de línea
docker run -p 8080:80 `
  -v ${PWD}/books:/app/books `
  -v ${PWD}/prompts:/app/prompts `
  -v ${PWD}/config.yaml:/app/config.yaml:ro `
  adt-studio
```

**Ejemplo con volúmenes opcionales (Docker Compose):**

Descomentar las líneas correspondientes en `docker-compose.yml`:

```yaml
volumes:
  - ./books:/app/books
  - ./prompts:/app/prompts           # descomentar
  - ./templates:/app/templates:ro     # descomentar
  - ./config.yaml:/app/config.yaml:ro # descomentar
```

---

## Verificación y Primeros Pasos

### Verificar que la aplicación está funcionando

**Desde el navegador:** Acceder a la URL correspondiente (http://localhost:5173 para desarrollo local, http://localhost:8080 para Docker).

**Desde la terminal (health check del API):**

```bash
# Desarrollo local
curl http://localhost:3001/api/health

# Docker
curl http://localhost:8080/api/health

# Windows (PowerShell, si curl no está disponible)
Invoke-RestMethod http://localhost:8080/api/health
```

Si todo está correcto, la respuesta será un JSON con estado OK.

### Primeros pasos con un libro

1. Abrir la aplicación en el navegador
2. Ingresar la clave de API de OpenAI cuando la aplicación lo solicite
3. Hacer clic en **"Add Book"** (Agregar Libro)
4. Completar el asistente: seleccionar el archivo PDF, asignar una etiqueta, definir el rango de páginas y otros parámetros
5. La extracción del PDF comenzará automáticamente
6. Una vez terminada, se mostrará el storyboard para revisión y edición

---

## Solución de Problemas Comunes

### `pnpm: command not found`

Asegurarse de que `corepack` está habilitado:

```bash
corepack enable
corepack prepare pnpm@10.32.1 --activate
```

### Error de versión de Node.js

ADT Studio requiere Node.js 22 o superior. Verificar con:

```bash
node --version
```

Si la versión es inferior a 22, actualizar usando `nvm`, `fnm` o descargando desde [nodejs.org](https://nodejs.org/).

### Puerto en uso

Si el puerto 5173 (desarrollo) u 8080 (Docker) ya está en uso:

- **Desarrollo local:** Vite automáticamente intentará el siguiente puerto disponible y lo mostrará en la terminal.
- **Docker:** Cambiar el puerto en el comando `docker run` o en el archivo `.env`.

### Docker: error de permisos en `./books`

Si el contenedor no puede escribir en el directorio `books/`:

```bash
# macOS / Linux — crear el directorio con los permisos adecuados
mkdir -p books
chmod 777 books
```

> **Windows:** Los problemas de permisos en volúmenes de Docker son menos comunes en Windows con Docker Desktop + WSL2. Si ocurren, verificar que la carpeta del proyecto esté dentro del filesystem de WSL2 o que Docker Desktop tenga permisos para compartir la unidad correspondiente (Settings > Resources > File Sharing).

### Docker: la compilación es muy lenta

La primera compilación descarga muchas dependencias y el navegador Chromium. Las compilaciones subsecuentes serán mucho más rápidas gracias al caché de capas de Docker. Si se necesita reconstruir sin caché:

```bash
docker build --no-cache --target app -t adt-studio .
```

### Windows: `corepack enable` falla con error de permisos

Abrir PowerShell como Administrador y ejecutar:

```powershell
corepack enable
```

### Windows: rutas largas causan errores en `pnpm install`

Si se encuentran errores relacionados con rutas de archivo demasiado largas, habilitar el soporte de rutas largas en Windows:

```powershell
# Ejecutar como Administrador
git config --system core.longpaths true
```

También verificar que la política de rutas largas esté habilitada en el registro de Windows:

```powershell
# Ejecutar como Administrador
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

---

## Notas Específicas por Sistema Operativo

### Windows

- **Shell recomendado:** PowerShell o Git Bash (incluido con [Git for Windows](https://gitforwindows.org/)). Evitar CMD.
- **Docker:** Requiere [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) con backend WSL2.
- **Rutas de volúmenes Docker:** Usar `${PWD}/books` (PowerShell) o `%cd%/books` (CMD) en lugar de `./books`.
- **Continuación de línea:** En PowerShell usar `` ` `` en lugar de `\` para comandos multilínea.
- **Instaladores Electron firmados:** Requiere un token de firma (ver [`apps/desktop/README.md`](../apps/desktop/README.md) para `AZ_TOKEN` / `jsign.jar`). Java es necesario para ejecutar `jsign.jar`. Las compilaciones locales sin firma no requieren herramientas adicionales.
- **Permisos de corepack:** Puede requerir ejecutar PowerShell como Administrador para `corepack enable`.

### macOS

- **Docker:** Instalar [Docker Desktop para Mac](https://docs.docker.com/desktop/install/mac-install/) (disponible para Apple Silicon y Intel).
- **Instaladores Electron notarizados:** Requiere credenciales de Apple Developer (`APPLEID`, `APPLEIDPASS`, `APPLEIDTEAM`). Las compilaciones locales sin firma no requieren herramientas adicionales.
- **Gestor de versiones de Node:** `nvm` o `fnm` funcionan nativamente. También se puede usar `brew install node@22`.

### Linux

- **Docker:** Instalar [Docker Engine](https://docs.docker.com/engine/install/) + [Docker Compose plugin](https://docs.docker.com/compose/install/linux/). Docker Desktop también está disponible pero no es obligatorio.
- **App de escritorio Electron:** No requiere paquetes del sistema adicionales en la mayoría de las distribuciones — solo Node.js y pnpm.
- **Permisos de Docker sin root:**
  ```bash
  sudo usermod -aG docker $USER
  # Cerrar sesión y volver a iniciar para que tome efecto
  ```
