# Q Agency Toolbox - actualizador para Windows.
# Compara la version instalada con la publicada en GitHub y, solo si la de
# GitHub es mas nueva, descarga el paquete de Windows y lo instala encima.
# Los ajustes (tu nombre, el equipo, el tema) viven en el navegador, asi que
# se conservan. Solo descarga del repositorio de la herramienta.
# (Los mensajes van sin acentos para que se lean bien en cualquier consola.)
#
# Solo instala un paquete firmado: la firma (QAgency-Toolbox-Windows.zip.sig)
# se verifica con la llave publica de abajo. La llave privada no esta en
# GitHub, asi que alguien que entre a esa cuenta no puede repartir un paquete
# propio. Con -SoloRevisar descarga y verifica, pero no instala.
# Con -Oculto (lo usa el boton Actualizar de la herramienta, que lo abre sin
# ventana de consola) no espera Enter: el resultado sale en un cuadro de
# Windows. -SegundosAviso cierra ese cuadro solo (para las pruebas).
param(
  [string]$Fuente = "https://raw.githubusercontent.com/therealedo/qagency-toolbox/main",
  [switch]$SinPausa,
  [switch]$SoloRevisar,
  [switch]$Oculto,
  [int]$SegundosAviso = 0
)

$ErrorActionPreference = "Stop"
$nombre  = "Q Agency Toolbox"
$destino = Join-Path $env:LOCALAPPDATA "QAgencyToolbox"
$html    = Join-Path $destino "QAgency-Toolbox.html"

# Llave publica de quien publica las versiones (RSA 3072, SHA-256).
# La escribe "node tools/sign.js --new-key"; no se cambia a mano.
$llaveModulo    = "ukCtjH0IGz1VOzoGyLEGor9GbHbY0eZqFJgpAuFc+YZPW1lYOzXGwFm85z8BJWfs9jpzP5xkHtDdPLhf1FmeRh7sCWLHPwnmfnh19RfrKMyVO4cdUuG6BbIOlP2EFJYBJqGwqoJKWDFuZm0ujA/XLBe5wZ2oopua4lzHw8ejUG8jSezvlL6eVIleakAcPYEgB4hXGPV2CiCWTn/TWPDtwVr8H5td1cEhzaFrGt9R2Ff59OKWYF5QS8MMuBKgy6MTA5Duhl8dNAB7iWR9iclthJzVuIWq3URrS8o0Cny0IYcviXqsHwSKtUX8S4kkj7vqJcD4f6nWJTpx1dC1WqXywJg1IwfVXV0ur9lPBurNk1fw2pZ9zLcxNwMjleg6zxZ6LS8C7vDTqrJSH9F/lvthib+eHueLiuoUXju7Oh14IOhrerJPD6A6eaZEv2m6OxjQXFWULHqc5ejqFEjUfjSvSDgbNGAGNBLZcOYQB/nryeGxPJHDXxRw0KgY9YhE2tOr"
$llaveExponente = "AQAB"

function Firma-Valida([string]$archivo, [string]$archivoFirma) {
  if (-not $llaveModulo -or -not (Test-Path $archivoFirma)) { return $false }
  try {
    $parametros = New-Object System.Security.Cryptography.RSAParameters
    $parametros.Modulus  = [Convert]::FromBase64String($llaveModulo)
    $parametros.Exponent = [Convert]::FromBase64String($llaveExponente)
    $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider
    $rsa.ImportParameters($parametros)
    $firma = [Convert]::FromBase64String(([IO.File]::ReadAllText($archivoFirma)).Trim())
    return $rsa.VerifyData([IO.File]::ReadAllBytes($archivo), "SHA256", $firma)
  } catch {
    return $false
  }
}

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

# El resultado que se avisa al final: en la consola sale de todas formas
$script:aviso = ""
function Avisar([string]$texto) {
  Write-Host $texto
  $script:aviso = if ($script:aviso) { $script:aviso + "`n" + $texto } else { $texto }
}

function Terminar([int]$codigo) {
  if ($Oculto) {
    # sin consola: un cuadro de Windows con el resultado (informacion o aviso),
    # encima de todo (4096) para que no quede detras del navegador
    try {
      $icono = 4096 + $(if ($codigo -eq 0) { 64 } else { 48 })
      (New-Object -ComObject WScript.Shell).Popup($script:aviso, $SegundosAviso, "Actualizar $nombre", $icono) | Out-Null
    } catch { }
  } elseif (-not $SinPausa) { Write-Host ""; Read-Host "Pulsa Enter para cerrar" | Out-Null }
  exit $codigo
}

if (-not (Test-Path $html)) {
  Avisar "$nombre no esta instalado en esta computadora."
  Avisar "Instalalo primero con Instalar.bat del paquete de Windows."
  Terminar 1
}

# Windows PowerShell 5 necesita TLS 1.2 para hablar con GitHub
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

$local = Version-Del-Html $html
Write-Host "Version instalada: $local"

try {
  $pkg = Invoke-RestMethod -UseBasicParsing -Uri "$Fuente/package.json" -Headers @{ "Cache-Control" = "no-cache" }
} catch {
  Avisar "No se pudo consultar GitHub. Revisa la conexion a internet y vuelve a intentar."
  Terminar 1
}
$remota = Como-Version ([string]$pkg.version)
if (-not $remota) {
  Avisar "GitHub no devolvio un numero de version valido. No se cambio nada."
  Terminar 1
}
if ($local -and $remota -le $local) {
  Avisar "Ya tienes la ultima version ($local). No hace falta actualizar."
  Terminar 0
}

Write-Host "Hay una version nueva: $remota. Descargando..."
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("QAgencyToolbox-" + [guid]::NewGuid().ToString("N"))
$codigo = 0
try {
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $zip = Join-Path $tmp "paquete.zip"
  Invoke-WebRequest -UseBasicParsing -Uri "$Fuente/dist/QAgency-Toolbox-Windows.zip" -OutFile $zip
  $firma = Join-Path $tmp "paquete.zip.sig"
  try { Invoke-WebRequest -UseBasicParsing -Uri "$Fuente/dist/QAgency-Toolbox-Windows.zip.sig" -OutFile $firma } catch { }
  # Antes de abrir el paquete: tiene que estar firmado por quien publica
  if (-not (Firma-Valida $zip $firma)) {
    throw "El paquete de GitHub no tiene una firma valida de Q Agency. No se instalo nada. Avisa a quien publica la herramienta."
  }
  Write-Host "Firma del paquete verificada."
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $carpeta = Join-Path $tmp "QAgency-Toolbox"
  $nuevo = Join-Path $carpeta "QAgency-Toolbox.html"
  if (-not (Test-Path $nuevo)) { throw "El paquete descargado esta incompleto. No se cambio nada." }
  # El paquete tiene que ser exactamente la version anunciada: si el .zip de
  # GitHub todavia no se reconstruyo, no se instala una version vieja.
  $vNuevo = Version-Del-Html $nuevo
  if ($vNuevo -ne $remota) { throw "El paquete de GitHub todavia es la version $vNuevo y no la $remota. No se cambio nada; prueba mas tarde." }
  if ($SoloRevisar) {
    Avisar "Paquete $remota verificado. No se instalo (-SoloRevisar)."
  } else {
    & (Join-Path $carpeta "instalar.ps1") -SinPreguntar
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "La instalacion no termino. Prueba de nuevo o usa Instalar.bat del paquete." }
    Write-Host ""
    # lo que dijo el instalador no va en el cuadro: solo el resultado
    $script:aviso = ""
    Avisar "Listo: $nombre $remota."
    Avisar "Si la herramienta estaba abierta, cierrala y vuelve a abrirla."
  }
} catch {
  Avisar $_.Exception.Message
  $codigo = 1
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
Terminar $codigo
