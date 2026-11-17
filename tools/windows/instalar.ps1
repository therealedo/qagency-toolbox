# Q Agency Toolbox - instalador para Windows.
# Copia la herramienta a la carpeta del usuario y crea accesos directos que la
# abren en su propia ventana, con su icono. No necesita permisos de
# administrador ni internet. Con -Quitar deshace todo.
# (Los mensajes van sin acentos para que se lean bien en cualquier consola.)
param([switch]$Quitar)

$ErrorActionPreference = "Stop"
$nombre  = "Q Agency Toolbox"
$origen  = Split-Path -Parent $MyInvocation.MyCommand.Path
$destino = Join-Path $env:LOCALAPPDATA "QAgencyToolbox"
$accesos = @(
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "$nombre.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Programs")) "$nombre.lnk")
)
# Accesos al actualizador: revisa GitHub e instala solo si hay version nueva
$accesosActualizar = @(
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "Actualizar $nombre.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Programs")) "Actualizar $nombre.lnk")
)

if ($Quitar) {
  foreach ($a in ($accesos + $accesosActualizar)) { if (Test-Path $a) { Remove-Item $a -Force } }
  if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
  Write-Host "$nombre se quito de esta computadora."
  exit 0
}

# Se usa el primer navegador que exista: Chrome, Edge o Brave. Brave va al
# final porque no deja elegir carpetas, y sin eso no se guarda en el Network.
# Edge viene con Windows 10 y 11.
$navegadores = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
  "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
  "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
)
$navegador = $navegadores | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
# Al actualizar se mantiene el navegador del acceso directo que ya existe: los
# ajustes (tu nombre, el equipo, el tema) viven en ese navegador, y abrir la
# herramienta con otro los dejaria vacios.
$shellPrevio = New-Object -ComObject WScript.Shell
# Si ya se abria con su propio perfil (ver $perfil abajo), no hay que avisar
$propioAntes = $false
$habiaAcceso = $false
foreach ($a in $accesos) {
  if (Test-Path $a) {
    $habiaAcceso = $true
    $lnk = $shellPrevio.CreateShortcut($a)
    if ($lnk.Arguments -match '--user-data-dir') { $propioAntes = $true }
    $previo = $lnk.TargetPath
    if ($previo -and ($previo -match '\\(chrome|msedge|brave)\.exe$') -and (Test-Path $previo)) { $navegador = $previo; break }
  }
}
if (-not $navegador) {
  Write-Host "No se encontro Chrome, Edge ni Brave en esta computadora."
  exit 1
}

$html = Join-Path $origen "QAgency-Toolbox.html"
if (-not (Test-Path $html)) {
  Write-Host "No se encuentra QAgency-Toolbox.html junto al instalador."
  Write-Host "Extrae primero toda la carpeta del .zip y vuelve a intentar."
  exit 1
}

New-Item -ItemType Directory -Force -Path $destino | Out-Null
Copy-Item -Force $html $destino
Copy-Item -Force (Join-Path $origen "toolbox.ico") $destino

$pagina = ([System.Uri](Join-Path $destino "QAgency-Toolbox.html")).AbsoluteUri
# La herramienta abre siempre con su propio perfil del navegador. Sin un perfil
# fijo, Chrome la abre en el ultimo perfil que se uso, y con varios perfiles los
# ajustes (equipo, oficina, carpetas) parecen perderse al cerrarla y abrirla.
$perfil = Join-Path $destino "Navegador"
New-Item -ItemType Directory -Force -Path $perfil | Out-Null
$shell = New-Object -ComObject WScript.Shell
foreach ($a in $accesos) {
  $s = $shell.CreateShortcut($a)
  $s.TargetPath = $navegador
  $s.Arguments = "--user-data-dir=`"$perfil`" --no-first-run --no-default-browser-check --app=`"$pagina`""
  $s.IconLocation = (Join-Path $destino "toolbox.ico")
  $s.WorkingDirectory = $destino
  $s.Description = "Nota, task y reporte en un solo paso"
  $s.Save()
}

# El actualizador queda junto a la herramienta. Su acceso directo llama a
# PowerShell, no a un .bat, porque el actualizador reemplaza sus propios
# archivos al instalar la version nueva.
$actualizador = Join-Path $origen "actualizar.ps1"
if (Test-Path $actualizador) {
  Copy-Item -Force $actualizador $destino
  $powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  foreach ($a in $accesosActualizar) {
    $s = $shell.CreateShortcut($a)
    $s.TargetPath = $powershell
    $s.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $destino 'actualizar.ps1')`""
    $s.IconLocation = (Join-Path $destino "toolbox.ico")
    $s.WorkingDirectory = $destino
    $s.Description = "Instala la version nueva de $nombre si la hay"
    $s.Save()
  }
}

Write-Host ""
Write-Host "$nombre quedo instalado."
Write-Host "Abrelo desde el Escritorio o desde el menu Inicio."
Write-Host "Para dejarlo en la barra de tareas: abrelo, haz clic derecho en su"
Write-Host "icono de la barra y elige 'Anclar a la barra de tareas'."
Write-Host "Para actualizarlo: abre 'Actualizar $nombre' en el Escritorio o el"
Write-Host "menu Inicio. Solo instala algo cuando hay una version nueva."
if ($habiaAcceso -and -not $propioAntes) {
  Write-Host ""
  Write-Host "IMPORTANTE: desde esta version la herramienta abre siempre con su propio"
  Write-Host "perfil del navegador, para que los ajustes no se pierdan al cerrarla."
  Write-Host "La primera vez que la abras configurala de nuevo: Ajustes > Importar equipo"
  Write-Host "(QAgency-Equipo.json), tu nombre, la oficina y las carpetas del Network."
  Write-Host "Si la tenias anclada en la barra de tareas, quitala y vuelve a anclarla."
}
