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

if ($Quitar) {
  foreach ($a in $accesos) { if (Test-Path $a) { Remove-Item $a -Force } }
  if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
  Write-Host "$nombre se quito de esta computadora."
  exit 0
}

# Se usa el primer navegador que exista: Brave, Chrome o Edge.
$navegadores = @(
  "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
  "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
  "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$navegador = $navegadores | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $navegador) {
  Write-Host "No se encontro Brave, Chrome ni Edge en esta computadora."
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
$shell = New-Object -ComObject WScript.Shell
foreach ($a in $accesos) {
  $s = $shell.CreateShortcut($a)
  $s.TargetPath = $navegador
  $s.Arguments = "--app=`"$pagina`""
  $s.IconLocation = (Join-Path $destino "toolbox.ico")
  $s.WorkingDirectory = $destino
  $s.Description = "Nota, task y reporte en un solo paso"
  $s.Save()
}

Write-Host ""
Write-Host "$nombre quedo instalado."
Write-Host "Abrelo desde el Escritorio o desde el menu Inicio."
Write-Host "Para dejarlo en la barra de tareas: abrelo, haz clic derecho en su"
Write-Host "icono de la barra y elige 'Anclar a la barra de tareas'."
