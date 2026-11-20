# Q Agency Toolbox - ayudante de firma (SignWell).
# Escucha solo en 127.0.0.1. La herramienta le pasa en JSON el Consent o el
# SOA que hay que firmar; el ayudante guarda la clave de la API de SignWell
# (cifrada con DPAPI, solo la lee este usuario de Windows), hace la llamada,
# revisa cada minuto los documentos enviados y entrega el PDF firmado a la
# herramienta, que lo guarda en el Network. En el disco guarda solo los
# numeros de los documentos: ningun dato del cliente.
# Rutas: GET /health; POST /send, /list, /pdf, /ack (con X-Helper-Token).
# (Los mensajes van sin acentos para que se lean bien en cualquier consola.)
param(
  [int]$Port = 47815,
  [string]$Dir = (Join-Path $env:LOCALAPPDATA "QAgencyToolbox\firma"),
  [string]$ApiBase = "https://www.signwell.com/api/v1",
  [int]$PollSeconds = 60
)

$ErrorActionPreference = "Stop"
$Version = "1"
Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Security
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$claveFile = Join-Path $Dir "clave.txt"
$tokenFile = Join-Path $Dir "token.txt"
$ajustesFile = Join-Path $Dir "ajustes.json"
$pendFile = Join-Path $Dir "pendientes.json"
$logFile = Join-Path $Dir "registro.log"
New-Item -ItemType Directory -Force -Path $Dir | Out-Null

# El registro dice que paso, nunca con que datos: ni cuerpos, ni nombres,
# ni enlaces, ni la clave, ni el token.
function Write-Log([string]$msg) {
  try { Add-Content -LiteralPath $logFile -Value ((Get-Date).ToString("s") + " " + $msg) -Encoding UTF8 } catch { }
}

# La clave: la escribe el instalador con ConvertFrom-SecureString (DPAPI del
# usuario actual). Sin clave el ayudante responde, pero no envia nada.
$apiKey = $null
if (Test-Path -LiteralPath $claveFile) {
  try {
    $sec = (Get-Content -LiteralPath $claveFile -Raw).Trim() | ConvertTo-SecureString
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  } catch { Write-Log "clave ilegible"; $apiKey = $null }
}
$token = if (Test-Path -LiteralPath $tokenFile) { (Get-Content -LiteralPath $tokenFile -Raw).Trim() } else { "" }
if ($token.Length -lt 32) { Write-Log "sin token: no se acepta nada"; $token = $null }

# Modo de prueba salvo que ajustes.json diga {"testMode": false}: sin un BAA
# firmado con SignWell, solo datos de prueba.
$testMode = $true
if (Test-Path -LiteralPath $ajustesFile) {
  try { $aj = Get-Content -LiteralPath $ajustesFile -Raw | ConvertFrom-Json; if ($aj.testMode -eq $false) { $testMode = $false } } catch { }
}

# Pendientes: solo los numeros de documento, en el disco. Lo demas (estado y
# metadata) se pide a SignWell y vive en memoria.
$pending = New-Object System.Collections.ArrayList
if (Test-Path -LiteralPath $pendFile) {
  try { foreach ($i in @(Get-Content -LiteralPath $pendFile -Raw | ConvertFrom-Json)) { if ($i -match '^[A-Za-z0-9_-]+$') { [void]$pending.Add([string]$i) } } } catch { }
}
$cache = @{}
function Save-Pending {
  $json = if ($pending.Count) { ConvertTo-Json -InputObject ([object[]]$pending.ToArray()) -Compress } else { "[]" }
  Set-Content -LiteralPath $pendFile -Value $json -Encoding UTF8
}

# Sin redirecciones automaticas: HttpClient reenviaria X-Api-Key al servidor
# al que SignWell redirija (por ejemplo, donde guarda el PDF). Una
# redireccion de un GET se sigue a mano, una sola vez y sin la clave.
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AllowAutoRedirect = $false
$http = New-Object System.Net.Http.HttpClient($handler)
$http.Timeout = [TimeSpan]::FromSeconds(30)
function Read-Result($res) {
  return @{ code = [int]$res.StatusCode; bytes = $res.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult();
            type = [string]$res.Content.Headers.ContentType }
}
function Invoke-SignWell([string]$method, [string]$path, $body) {
  $uri = New-Object System.Uri ($ApiBase + $path)
  $req = New-Object System.Net.Http.HttpRequestMessage ([System.Net.Http.HttpMethod]::new($method)), $uri
  $req.Headers.Add("X-Api-Key", $apiKey)
  $req.Headers.Add("Accept", "application/json")
  if ($null -ne $body) {
    $req.Content = New-Object System.Net.Http.StringContent ((ConvertTo-Json -InputObject $body -Depth 8 -Compress), [Text.Encoding]::UTF8, "application/json")
  }
  $res = $http.SendAsync($req).GetAwaiter().GetResult()
  $code = [int]$res.StatusCode
  if ($method -eq "GET" -and @(301, 302, 303, 307, 308) -contains $code -and $res.Headers.Location) {
    $to = $res.Headers.Location
    if (-not $to.IsAbsoluteUri) { $to = New-Object System.Uri ($uri, $to) }
    if (@("https", "http") -notcontains $to.Scheme) { return @{ code = 502; bytes = [byte[]]@(); type = "" } }
    $res = $http.GetAsync($to).GetAwaiter().GetResult()
  }
  return (Read-Result $res)
}
function Read-Json($bytes) {
  try { return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json) } catch { return $null }
}

function Get-Meta($doc) {
  $m = $doc.metadata
  if ($null -eq $m) { return @{} }
  return @{ kind = [string]$m.qa_kind; line = [string]$m.qa_line; netKey = [string]$m.qa_net; fileName = [string]$m.qa_file }
}

# Pregunta a SignWell el estado de cada documento pendiente.
function Update-Pending {
  if (-not $apiKey) { return }
  foreach ($id in @($pending.ToArray())) {
    try {
      $r = Invoke-SignWell "GET" ("/documents/" + $id) $null
      if ($r.code -eq 200) {
        $doc = Read-Json $r.bytes
        $cache[$id] = @{ status = ([string]$doc.status).ToLowerInvariant(); meta = (Get-Meta $doc) }
      } elseif ($r.code -eq 404) {
        $cache[$id] = @{ status = "missing"; meta = @{} }
      } else {
        Write-Log ("estado " + $id + " http " + $r.code)
      }
    } catch { Write-Log ("estado " + $id + " sin conexion") }
  }
}

function Send-Response($ctx, [int]$code, $obj, [byte[]]$raw, [string]$type) {
  $res = $ctx.Response
  $res.StatusCode = $code
  $res.Headers["Cache-Control"] = "no-store"
  $res.Headers["X-Content-Type-Options"] = "nosniff"
  if ($ctx.Request.Headers["Origin"] -eq "null") {
    $res.Headers["Access-Control-Allow-Origin"] = "null"
    $res.Headers["Vary"] = "Origin"
  }
  if ($null -eq $raw) {
    $raw = if ($null -eq $obj) { [byte[]]@() } else { [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $obj -Depth 8 -Compress)) }
    $type = "application/json; charset=utf-8"
  }
  if ($raw.Length) { $res.ContentType = $type }
  $res.ContentLength64 = $raw.Length
  if ($raw.Length) { $res.OutputStream.Write($raw, 0, $raw.Length) }
  $res.Close()
}

function Test-Token([string]$given) {
  if (-not $token -or -not $given -or $given.Length -ne $token.Length) { return $false }
  $diff = 0
  for ($i = 0; $i -lt $token.Length; $i++) { $diff = $diff -bor ([int][char]$token[$i] -bxor [int][char]$given[$i]) }
  return $diff -eq 0
}

function Read-Body($req) {
  if ($req.ContentLength64 -gt 65536) { return @{ tooBig = $true } }
  $sr = New-Object System.IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)
  $text = $sr.ReadToEnd()
  if ($text.Length -gt 65536) { return @{ tooBig = $true } }
  try { return @{ json = ($text | ConvertFrom-Json) } } catch { return @{ bad = $true } }
}

function Text-Ok($s, [int]$max) { return ($s -is [string]) -and $s.Trim().Length -gt 0 -and $s.Length -le $max }

# Lo que llega se revisa campo por campo antes de pasarlo a SignWell.
function Build-Document($b) {
  if (-not ((Text-Ok $b.templateId 100) -and $b.templateId -match '^[A-Za-z0-9_-]+$')) { return $null }
  if (-not ((Text-Ok $b.placeholder 100) -and (Text-Ok $b.recipient.name 200))) { return $null }
  if (-not ((Text-Ok $b.recipient.email 200) -and $b.recipient.email -match '^[^\s@]+@[^\s@]+\.[^\s@]+$')) { return $null }
  if (@("es", "en") -notcontains $b.language) { return $null }
  if (@("consent", "soa") -notcontains $b.meta.kind) { return $null }
  if (-not ((Text-Ok $b.meta.fileName 200) -and ([string]$b.meta.line -match '^[a-z]{0,10}$') -and ([string]$b.meta.netKey -match '^[a-z]{1,20}$'))) { return $null }
  $fields = New-Object System.Collections.ArrayList
  foreach ($f in @($b.fields)) {
    if ($null -eq $f) { continue }
    if (-not (($f.api_id -is [string]) -and $f.api_id -match '^[A-Za-z0-9_]{1,60}$' -and (Text-Ok $f.value 500))) { return $null }
    [void]$fields.Add(@{ api_id = $f.api_id; value = $f.value })
  }
  $requester = if (Text-Ok $b.requester 100) { $b.requester } else { $null }
  $doc = [ordered]@{
    test_mode = $testMode
    template_id = $b.templateId
    recipients = @(@{ id = "1"; placeholder_name = $b.placeholder; name = $b.recipient.name; email = $b.recipient.email })
    template_fields = [object[]]$fields.ToArray()
    language = $b.language
    metadata = @{ qa_kind = $b.meta.kind; qa_line = [string]$b.meta.line; qa_net = $b.meta.netKey; qa_file = $b.meta.fileName }
  }
  if ($requester) { $doc.custom_requester_name = $requester }
  return $doc
}

function Handle($ctx) {
  $req = $ctx.Request
  $path = $req.Url.AbsolutePath
  $route = $req.HttpMethod + " " + $path
  # Solo esta computadora, y solo esta direccion (contra DNS rebinding)
  $hostHeader = [string]$req.Headers["Host"]
  if (@("127.0.0.1:$Port", "localhost:$Port") -notcontains $hostHeader) { Write-Log "rechazado host"; Send-Response $ctx 403 @{ error = "host" }; return }
  # Solo la pagina de la herramienta (file://, Origin null), o sin Origin
  $origin = $req.Headers["Origin"]
  if ($origin -and $origin -ne "null") { Write-Log "rechazado origin"; Send-Response $ctx 403 @{ error = "origin" }; return }
  if ($req.HttpMethod -eq "OPTIONS") {
    $ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST"
    $ctx.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-Helper-Token"
    $ctx.Response.Headers["Access-Control-Max-Age"] = "600"
    if ($req.Headers["Access-Control-Request-Private-Network"] -eq "true") { $ctx.Response.Headers["Access-Control-Allow-Private-Network"] = "true" }
    Send-Response $ctx 204 $null; return
  }
  if ($route -eq "GET /health") {
    Send-Response $ctx 200 @{ ok = [bool]$apiKey; testMode = $testMode; version = $Version; error = $(if ($apiKey) { $null } else { "sin-clave" }) }
    return
  }
  if (-not (Test-Token ([string]$req.Headers["X-Helper-Token"]))) { Write-Log ("rechazado token " + $route); Send-Response $ctx 401 @{ error = "token" }; return }
  if ($req.HttpMethod -ne "POST") { Send-Response $ctx 405 @{ error = "method" }; return }
  if (-not ([string]$req.ContentType).StartsWith("application/json")) { Write-Log ("rechazado tipo " + $route); Send-Response $ctx 415 @{ error = "content-type" }; return }
  $in = Read-Body $req
  if ($in.tooBig) { Send-Response $ctx 413 @{ error = "too-big" }; return }
  if ($in.bad) { Send-Response $ctx 400 @{ error = "json" }; return }
  $b = $in.json
  if (-not $apiKey) { Send-Response $ctx 503 @{ error = "sin-clave" }; return }

  switch ($path) {
    "/send" {
      $doc = Build-Document $b
      if ($null -eq $doc) { Write-Log "send invalido"; Send-Response $ctx 400 @{ error = "datos" }; return }
      try { $r = Invoke-SignWell "POST" "/document_templates/documents" $doc } catch { Write-Log "send sin conexion"; Send-Response $ctx 502 @{ error = "conexion" }; return }
      $res = Read-Json $r.bytes
      if ($r.code -lt 200 -or $r.code -ge 300 -or -not $res -or -not ([string]$res.id -match '^[A-Za-z0-9_-]+$')) {
        Write-Log ("send http " + $r.code)
        Send-Response $ctx 502 @{ error = "signwell"; status = $r.code }; return
      }
      $id = [string]$res.id
      if (-not $pending.Contains($id)) { [void]$pending.Add($id); Save-Pending }
      $cache[$id] = @{ status = ([string]$res.status).ToLowerInvariant(); meta = (Get-Meta $res) }
      Write-Log ("send " + $id + " test=" + $testMode)
      Send-Response $ctx 200 @{ id = $id; status = $cache[$id].status; testMode = $testMode }
    }
    "/list" {
      if ($b.refresh -eq $true) { Update-Pending }
      $docs = New-Object System.Collections.ArrayList
      foreach ($id in $pending) {
        $c = $cache[$id]
        [void]$docs.Add(@{ id = $id; status = $(if ($c) { $c.status } else { "unknown" }); meta = $(if ($c) { $c.meta } else { @{} }) })
      }
      Send-Response $ctx 200 @{ docs = [object[]]$docs.ToArray() }
    }
    "/pdf" {
      $id = [string]$b.id
      if (-not $pending.Contains($id)) { Send-Response $ctx 404 @{ error = "id" }; return }
      if (-not $cache[$id] -or $cache[$id].status -ne "completed") { Send-Response $ctx 409 @{ error = "no-firmado" }; return }
      try { $r = Invoke-SignWell "GET" ("/documents/" + $id + "/completed_pdf?url_only=false") $null } catch { Send-Response $ctx 502 @{ error = "conexion" }; return }
      if ($r.code -ne 200 -or $r.bytes.Length -lt 5 -or [Text.Encoding]::ASCII.GetString($r.bytes, 0, 5) -ne "%PDF-") {
        Write-Log ("pdf " + $id + " http " + $r.code)
        Send-Response $ctx 502 @{ error = "signwell"; status = $r.code }; return
      }
      Write-Log ("pdf " + $id)
      Send-Response $ctx 200 $null $r.bytes "application/pdf"
    }
    "/ack" {
      # Se borra en SignWell solo cuando la herramienta ya lo guardo.
      $id = [string]$b.id
      if (-not $pending.Contains($id)) { Send-Response $ctx 404 @{ error = "id" }; return }
      try { $r = Invoke-SignWell "DELETE" ("/documents/" + $id) $null } catch { Send-Response $ctx 502 @{ error = "conexion" }; return }
      if (($r.code -lt 200 -or $r.code -ge 300) -and $r.code -ne 404) { Write-Log ("ack " + $id + " http " + $r.code); Send-Response $ctx 502 @{ error = "signwell"; status = $r.code }; return }
      $pending.Remove($id); $cache.Remove($id); Save-Pending
      Write-Log ("ack " + $id)
      Send-Response $ctx 200 @{ ok = $true }
    }
    default { Send-Response $ctx 404 @{ error = "ruta" } }
  }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
try { $listener.Start() } catch {
  Write-Log ("no se pudo abrir el puerto " + $Port)
  Write-Host "No se pudo abrir el puerto $Port. Puede que el ayudante ya este abierto."
  exit 1
}
Write-Log ("inicio puerto " + $Port + " test=" + $testMode + " pendientes=" + $pending.Count)
$nextPoll = Get-Date
$wait = $listener.GetContextAsync()
while ($listener.IsListening) {
  if ($wait.AsyncWaitHandle.WaitOne(1000)) {
    try { Handle $wait.Result } catch {
      Write-Log "error interno"
      try { $wait.Result.Response.StatusCode = 500; $wait.Result.Response.Close() } catch { }
    }
    $wait = $listener.GetContextAsync()
  }
  if ((Get-Date) -ge $nextPoll) {
    Update-Pending
    $nextPoll = (Get-Date).AddSeconds($PollSeconds)
  }
}
