# Q Agency Toolbox - instalador para Windows.
# Copia la herramienta a la carpeta del usuario y crea accesos directos que la
# abren en su propia ventana, con su icono. No necesita permisos de
# administrador ni internet. Con -Quitar deshace todo.
# (Los mensajes van sin acentos para que se lean bien en cualquier consola.)
# Con -Clave solo pide (o cambia) la clave de la API de SignWell. El
# actualizador lo llama con -SinPreguntar: no pide la clave.
param([switch]$Quitar, [switch]$Clave, [switch]$SinPreguntar)

$ErrorActionPreference = "Stop"
$nombre  = "Q Agency Toolbox"
$origen  = Split-Path -Parent $MyInvocation.MyCommand.Path
$destino = Join-Path $env:LOCALAPPDATA "QAgencyToolbox"
$accesos = @(
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "$nombre.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Programs")) "$nombre.lnk")
)
# Acceso al actualizador en el menu Inicio: revisa GitHub e instala solo si
# hay version nueva. El del Escritorio ya no se crea: la herramienta tiene su
# boton Actualizar arriba, que lo abre con el enlace de abajo.
$accesosActualizar = @(
  (Join-Path ([Environment]::GetFolderPath("Programs")) "Actualizar $nombre.lnk")
)
$actualizarEscritorio = Join-Path ([Environment]::GetFolderPath("Desktop")) "Actualizar $nombre.lnk"
# Enlace qagency-toolbox-update: que abre el boton Actualizar de la
# herramienta. Va en HKCU, sin permisos de administrador.
$claveEnlace = "HKCU:\Software\Classes\qagency-toolbox-update"

# Ayudante de firma (signing-helper.ps1): escucha solo en 127.0.0.1, guarda
# la clave de SignWell cifrada para este usuario de Windows (DPAPI) y arranca
# al iniciar sesion. firma\ guarda la clave, el token que comparte con la
# herramienta (helper-config.js) y los numeros de los documentos enviados.
$firma = Join-Path $destino "firma"
$ayudante = Join-Path $destino "signing-helper.ps1"
$accesoAyudante = Join-Path ([Environment]::GetFolderPath("Startup")) "Ayudante de firma $nombre.lnk"
$powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
function Detener-Ayudante {
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*signing-helper.ps1*" } |
    ForEach-Object { try { Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null } catch { } }
}
function Iniciar-Ayudante {
  if (Test-Path $ayudante) {
    Start-Process -FilePath $powershell -WindowStyle Hidden -WorkingDirectory $destino -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ayudante`""
  }
}
# La clave la pega quien instala; no se muestra ni se guarda en texto plano.
function Pedir-Clave {
  Write-Host ""
  Write-Host "Clave de la API de SignWell para enviar a firmar (Enter para omitir):"
  $s = Read-Host -AsSecureString
  if ($s.Length -eq 0) {
    if (Test-Path (Join-Path $firma "clave.txt")) { Write-Host "Se mantiene la clave que ya habia." }
    else { Write-Host "Sin clave: la herramienta no enviara a firmar hasta que se agregue con 'Clave de firma.bat'." }
    return
  }
  New-Item -ItemType Directory -Force -Path $firma | Out-Null
  $s | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $firma "clave.txt") -Encoding ASCII
  Write-Host "Clave guardada (cifrada para este usuario de Windows)."
}

if ($Quitar) {
  Detener-Ayudante
  $pend = Join-Path $firma "pendientes.json"
  $docsJson = Join-Path $firma "documentos.json"
  $sinGuardar = $false
  if ((Test-Path $pend) -and ((Get-Content -LiteralPath $pend -Raw) -match '"')) { $sinGuardar = $true }
  if (Test-Path $docsJson) {
    try { foreach ($i in (Get-Content -LiteralPath $docsJson -Raw | ConvertFrom-Json)) { if (-not $i.status -or ($i.status -eq "completed" -and -not $i.saved)) { $sinGuardar = $true } } } catch { }
  }
  if ($sinGuardar) {
    Write-Host "Aviso: habia documentos enviados a firmar que esperan la firma o sin guardar en el Network. Siguen en SignWell."
  }
  foreach ($a in ($accesos + $accesosActualizar + @($accesoAyudante, $actualizarEscritorio))) { if (Test-Path $a) { Remove-Item $a -Force } }
  if (Test-Path $claveEnlace) { Remove-Item $claveEnlace -Recurse -Force }
  if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
  Write-Host "$nombre se quito de esta computadora."
  exit 0
}

if ($Clave) {
  Pedir-Clave
  Detener-Ayudante
  Iniciar-Ayudante
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

# ?perfil=propio le dice a la herramienta que la abrio su icono: abierta de
# otra forma avisa que esa ventana no ve los ajustes.
$pagina = ([System.Uri](Join-Path $destino "QAgency-Toolbox.html")).AbsoluteUri + "?perfil=propio"
# La herramienta abre siempre con su propio perfil del navegador. Sin un perfil
# fijo, Chrome la abre en el ultimo perfil que se uso, y con varios perfiles los
# ajustes (equipo, oficina, carpetas) parecen perderse al cerrarla y abrirla.
$perfil = Join-Path $destino "Navegador"
New-Item -ItemType Directory -Force -Path $perfil | Out-Null
$argumentos = "--user-data-dir=`"$perfil`" --no-first-run --no-default-browser-check --app=`"$pagina`""
$shell = New-Object -ComObject WScript.Shell
function Apuntar-Acceso($s) {
  $s.TargetPath = $navegador
  $s.Arguments = $argumentos
  $s.IconLocation = (Join-Path $destino "toolbox.ico")
  $s.WorkingDirectory = $destino
  $s.Description = "Nota, task y reporte en un solo paso"
  $s.Save()
}
foreach ($a in $accesos) { Apuntar-Acceso ($shell.CreateShortcut($a)) }

# Un ancla de la barra de tareas es una copia del acceso directo y no cambia
# sola: una anclada antes de que la herramienta tuviera su propio perfil sigue
# abriendo el navegador en otro perfil, sin los ajustes. Se apunta como el
# acceso directo. Solo se tocan las que abren esta herramienta instalada.
$anclas = Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
$anclasArregladas = 0
if (Test-Path $anclas) {
  foreach ($f in (Get-ChildItem -LiteralPath $anclas -Filter "*.lnk" -ErrorAction SilentlyContinue)) {
    try {
      $s = $shell.CreateShortcut($f.FullName)
      $abreNavegador = $s.TargetPath -match '\\(chrome|msedge|brave)(_proxy)?\.exe$'
      if ($abreNavegador -and $s.Arguments -match 'QAgencyToolbox[\\/]+QAgency-Toolbox\.html' -and ($s.Arguments -ne $argumentos -or $s.TargetPath -ne $navegador)) {
        Apuntar-Acceso $s
        $anclasArregladas++
      }
    } catch { }
  }
}

# El actualizador queda junto a la herramienta. Su acceso directo llama a
# PowerShell, no a un .bat, porque el actualizador reemplaza sus propios
# archivos al instalar la version nueva.
$actualizador = Join-Path $origen "actualizar.ps1"
if (Test-Path $actualizador) {
  Copy-Item -Force $actualizador $destino
  foreach ($a in $accesosActualizar) {
    $s = $shell.CreateShortcut($a)
    $s.TargetPath = $powershell
    $s.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $destino 'actualizar.ps1')`""
    $s.IconLocation = (Join-Path $destino "toolbox.ico")
    $s.WorkingDirectory = $destino
    $s.Description = "Instala la version nueva de $nombre si la hay"
    $s.Save()
  }
  if (Test-Path $actualizarEscritorio) { Remove-Item $actualizarEscritorio -Force }
  # El boton Actualizar de la herramienta abre qagency-toolbox-update:run y
  # Windows corre el actualizador instalado. El comando no recibe la
  # direccion del enlace: lo unico que puede hacer es buscar una version
  # nueva firmada e instalarla.
  $comandoActualizar = "`"$powershell`" -NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $destino 'actualizar.ps1')`""
  New-Item -Path $claveEnlace -Force | Out-Null
  Set-ItemProperty -Path $claveEnlace -Name "(default)" -Value "URL:Actualizar $nombre"
  Set-ItemProperty -Path $claveEnlace -Name "URL Protocol" -Value ""
  New-Item -Path "$claveEnlace\DefaultIcon" -Force | Out-Null
  Set-ItemProperty -Path "$claveEnlace\DefaultIcon" -Name "(default)" -Value (Join-Path $destino "toolbox.ico")
  New-Item -Path "$claveEnlace\shell\open\command" -Force | Out-Null
  Set-ItemProperty -Path "$claveEnlace\shell\open\command" -Name "(default)" -Value $comandoActualizar
}

# El ayudante de firma. El token se crea una sola vez y se mantiene al
# actualizar; la herramienta lo lee de helper-config.js (junto al HTML), que
# ninguna pagina web puede leer.
$ayudanteOrigen = Join-Path $origen "signing-helper.ps1"
if (Test-Path $ayudanteOrigen) {
  Detener-Ayudante
  Copy-Item -Force $ayudanteOrigen $destino
  New-Item -ItemType Directory -Force -Path $firma | Out-Null
  $tokenFile = Join-Path $firma "token.txt"
  $tok = if (Test-Path $tokenFile) { (Get-Content -LiteralPath $tokenFile -Raw).Trim() } else { "" }
  if ($tok -notmatch '^[0-9a-f]{64}$') {
    $b = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    $tok = -join ($b | ForEach-Object { $_.ToString("x2") })
    Set-Content -LiteralPath $tokenFile -Value $tok -Encoding ASCII
  }
  Set-Content -LiteralPath (Join-Path $destino "helper-config.js") -Encoding ASCII `
    -Value ("window.QA_HELPER = { port: 47815, token: `"" + $tok + "`" };")
  # La clave se pide solo en una instalacion nueva: al actualizar (incluso con
  # un actualizador viejo, que no pasa -SinPreguntar) no se detiene a pedirla.
  if (-not (Test-Path (Join-Path $firma "clave.txt"))) {
    if (-not $SinPreguntar -and -not $habiaAcceso) { Pedir-Clave }
    else { Write-Host "Para enviar a firmar, agrega la clave de SignWell con 'Clave de firma.bat'." }
  }
  $s = $shell.CreateShortcut($accesoAyudante)
  $s.TargetPath = $powershell
  $s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ayudante`""
  $s.WindowStyle = 7
  $s.WorkingDirectory = $destino
  $s.Description = "Envia a firmar con SignWell desde $nombre"
  $s.Save()
  Iniciar-Ayudante
}

Write-Host ""
Write-Host "$nombre quedo instalado."
Write-Host "Abrelo desde el Escritorio o desde el menu Inicio."
Write-Host "Para dejarlo en la barra de tareas: abrelo, haz clic derecho en su"
Write-Host "icono de la barra y elige 'Anclar a la barra de tareas'."
Write-Host "Para actualizarlo: pulsa 'Actualizar' arriba en la herramienta (o abre"
Write-Host "'Actualizar $nombre' en el menu Inicio). Solo instala algo cuando hay una"
Write-Host "version nueva. La primera vez el navegador pregunta si abrir el"
Write-Host "actualizador: elige Abrir (y 'Permitir siempre' si lo ofrece)."
if ($habiaAcceso -and -not $propioAntes) {
  Write-Host ""
  Write-Host "IMPORTANTE: desde esta version la herramienta abre siempre con su propio"
  Write-Host "perfil del navegador, para que los ajustes no se pierdan al cerrarla."
  Write-Host "La primera vez que la abras configurala de nuevo: Ajustes > Importar equipo"
  Write-Host "(QAgency-Equipo.json), tu nombre, la oficina y las carpetas del Network."
}
if ($anclasArregladas -gt 0) {
  Write-Host ""
  Write-Host "Se arreglo el icono anclado en la barra de tareas: ahora abre la herramienta"
  Write-Host "con su propio perfil, igual que el icono del Escritorio."
  Write-Host "Si al abrirla falta tu equipo, importa QAgency-Equipo.json en Ajustes."
}
