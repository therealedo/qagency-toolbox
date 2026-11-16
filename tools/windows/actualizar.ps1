# Q Agency Toolbox - actualizador para Windows.
# Compara la version instalada con la publicada en GitHub y, solo si la de
# GitHub es mas nueva, descarga el paquete de Windows y lo instala encima.
# Los ajustes (tu nombre, el equipo, el tema) viven en el navegador, asi que
# se conservan. Solo descarga del repositorio de la herramienta.
# (Los mensajes van sin acentos para que se lean bien en cualquier consola.)
param(
  [string]$Fuente = "https://raw.githubusercontent.com/therealedo/qagency-toolbox/main",
  [switch]$SinPausa
)

$ErrorActionPreference = "Stop"
$nombre  = "Q Agency Toolbox"
$destino = Join-Path $env:LOCALAPPDATA "QAgencyToolbox"
$html    = Join-Path $destino "QAgency-Toolbox.html"

# "1.10.0" -> [version]; cualquier otra cosa -> $null
function Como-Version([string]$texto) {
  if ($texto -notmatch '^\d+(\.\d+){0,3}$') { return $null }
  $partes = @($texto.Split('.'))
  while ($partes.Count -lt 2) { $partes += '0' }
  return [version]($partes -join '.')
}

# La version va escrita en la configuracion que lleva adentro el .html
function Version-Del-Html([string]$archivo) {
  $m = [regex]::Match([IO.File]::ReadAllText($archivo), 'var VERSION = "(\d+(?:\.\d+)*)"')
  if (-not $m.Success) { return $null }
  return Como-Version $m.Groups[1].Value
}

function Terminar([int]$codigo) {
  if (-not $SinPausa) { Write-Host ""; Read-Host "Pulsa Enter para cerrar" | Out-Null }
  exit $codigo
}

if (-not (Test-Path $html)) {
  Write-Host "$nombre no esta instalado en esta computadora."
  Write-Host "Instalalo primero con Instalar.bat del paquete de Windows."
  Terminar 1
}

# Windows PowerShell 5 necesita TLS 1.2 para hablar con GitHub
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

$local = Version-Del-Html $html
Write-Host "Version instalada: $local"

try {
  $pkg = Invoke-RestMethod -UseBasicParsing -Uri "$Fuente/package.json" -Headers @{ "Cache-Control" = "no-cache" }
} catch {
  Write-Host "No se pudo consultar GitHub. Revisa la conexion a internet y vuelve a intentar."
  Terminar 1
}
$remota = Como-Version ([string]$pkg.version)
if (-not $remota) {
  Write-Host "GitHub no devolvio un numero de version valido. No se cambio nada."
  Terminar 1
}
if ($local -and $remota -le $local) {
  Write-Host "Ya tienes la ultima version ($local). No hace falta actualizar."
  Terminar 0
}

Write-Host "Hay una version nueva: $remota. Descargando..."
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("QAgencyToolbox-" + [guid]::NewGuid().ToString("N"))
$codigo = 0
try {
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $zip = Join-Path $tmp "paquete.zip"
  Invoke-WebRequest -UseBasicParsing -Uri "$Fuente/dist/QAgency-Toolbox-Windows.zip" -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $carpeta = Join-Path $tmp "QAgency-Toolbox"
  $nuevo = Join-Path $carpeta "QAgency-Toolbox.html"
  if (-not (Test-Path $nuevo)) { throw "El paquete descargado esta incompleto. No se cambio nada." }
  # El paquete tiene que ser exactamente la version anunciada: si el .zip de
  # GitHub todavia no se reconstruyo, no se instala una version vieja.
  $vNuevo = Version-Del-Html $nuevo
  if ($vNuevo -ne $remota) { throw "El paquete de GitHub todavia es la version $vNuevo y no la $remota. No se cambio nada; prueba mas tarde." }
  & (Join-Path $carpeta "instalar.ps1")
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "La instalacion no termino. Prueba de nuevo o usa Instalar.bat del paquete." }
  Write-Host ""
  Write-Host "Listo: $nombre $remota."
  Write-Host "Si la herramienta estaba abierta, cierrala y vuelve a abrirla."
} catch {
  Write-Host $_.Exception.Message
  $codigo = 1
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
Terminar $codigo
