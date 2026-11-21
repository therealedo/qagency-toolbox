# Q Agency Toolbox - ayudante de firma (SignWell).
# Escucha solo en 127.0.0.1. La herramienta le pasa en JSON el Consent o el
# SOA que hay que firmar; el ayudante guarda la clave de la API de SignWell
# (cifrada con DPAPI, solo la lee este usuario de Windows), hace la llamada,
# revisa cada minuto los documentos que esperan la firma y entrega el PDF
# firmado a la herramienta, que lo guarda en el Network. Los documentos se
# quedan en SignWell: son el historial del tablero Firmas. En el disco guarda
# solo los numeros de los documentos, la fecha de envio, el estado final y si
# ya se guardo en el Network: ningun dato del cliente.
# Rutas: GET /health; POST /send, /list, /pdf, /saved, /delete (con X-Helper-Token).
# (Los mensajes van sin acentos para que se lean bien en cualquier consola.)
param(
  [int]$Port = 47815,
  [string]$Dir = (Join-Path $env:LOCALAPPDATA "QAgencyToolbox\firma"),
  [string]$ApiBase = "https://www.signwell.com/api/v1",
  [int]$PollSeconds = 60
)

$ErrorActionPreference = "Stop"
$Version = "2"
Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Security
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$claveFile = Join-Path $Dir "clave.txt"
$tokenFile = Join-Path $Dir "token.txt"
$ajustesFile = Join-Path $Dir "ajustes.json"
$docsFile = Join-Path $Dir "documentos.json"
$oldFile = Join-Path $Dir "pendientes.json"
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

# Estados con los que un documento ya no cambia: no se vuelven a sondear.
$Final = @("completed", "declined", "expired", "canceled", "missing")
$idOk = '^[A-Za-z0-9_-]{1,100}$'

# En el disco, por documento enviado desde esta computadora: su numero,
# cuando se envio, su estado final y si ya se guardo en el Network. El
# cliente, el archivo y las fechas de SignWell se piden a SignWell y viven
# solo en memoria ($info).
$docs = New-Object System.Collections.ArrayList
$info = @{}
function New-Entry([string]$id, [string]$sent, [bool]$saved, [string]$status) {
  return [pscustomobject]@{ id = $id; sent = $sent; saved = $saved; status = $status }
}
# Se escribe aparte y se reemplaza de una vez: un corte a mitad de camino
# no deja el historial a medias.
function Save-Docs {
  $json = if ($docs.Count) { ConvertTo-Json -InputObject ([object[]]$docs.ToArray()) -Compress } else { "[]" }
  $tmp = $docsFile + ".tmp"
  Set-Content -LiteralPath $tmp -Value $json -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $docsFile -Force
}
function Find-Doc([string]$id) {
  foreach ($e in $docs) { if ($e.id -eq $id) { return $e } }
  return $null
}
$loaded = $false
if (Test-Path -LiteralPath $docsFile) {
  try {
    $saved = Get-Content -LiteralPath $docsFile -Raw | ConvertFrom-Json
    foreach ($i in $saved) {
      if ($null -eq $i -or -not (([string]$i.id) -match $idOk)) { continue }
      $st = [string]$i.status
      if ($Final -notcontains $st) { $st = "" }
      [void]$docs.Add((New-Entry ([string]$i.id) ([string]$i.sent) ($i.saved -eq $true) $st))
    }
    $loaded = $true
  } catch {
    # Ilegible: se aparta (no se pisa) para poder recuperarlo a mano.
    $docs.Clear()
    try { Move-Item -LiteralPath $docsFile -Destination ($docsFile + ".ilegible-" + (Get-Date).ToString("yyyyMMddHHmmss")) -Force } catch { }
    Write-Log "documentos.json ilegible: se aparto"
  }
}
if (-not $loaded -and (Test-Path -LiteralPath $oldFile)) {
  # La version 1 guardaba solo los pendientes: pasan al historial.
  try {
    $old = Get-Content -LiteralPath $oldFile -Raw | ConvertFrom-Json
    foreach ($i in $old) { if (([string]$i) -match $idOk) { [void]$docs.Add((New-Entry ([string]$i) "" $false "")) } }
    Save-Docs
    Remove-Item -LiteralPath $oldFile -Force
  } catch { Write-Log "pendientes.json ilegible" }
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

# Por que SignWell rechazo un envio: el texto va a la herramienta (para
# que se vea que corregir); al registro solo los nombres de las claves.
$keyOk = '^[A-Za-z0-9_.\[\]-]{1,80}$'
function Get-SignWellError($res, [byte[]]$bytes) {
  $keys = New-Object System.Collections.ArrayList
  $invalid = New-Object System.Collections.ArrayList
  $parts = New-Object System.Collections.ArrayList
  $e = $null
  if ($res) { $e = $res.errors; if ($null -eq $e) { $e = $res.error } }
  if ($e -is [string]) { [void]$parts.Add($e) }
  elseif ($null -ne $e) {
    foreach ($p in $e.PSObject.Properties) {
      if ($p.Name -eq "message") { [void]$parts.Insert(0, [string]$p.Value); continue }
      if ($p.Name -eq "invalid_keys") { foreach ($k in @($p.Value)) { if ([string]$k -match $keyOk) { [void]$invalid.Add([string]$k) } }; continue }
      if ($p.Name -notmatch $keyOk) { continue }
      [void]$keys.Add($p.Name)
      $v = $p.Value
      $txt = if ($v -is [string]) { $v } elseif ($v -is [array]) { (@($v) | ForEach-Object { [string]$_ }) -join " " } else { ConvertTo-Json -InputObject $v -Compress -Depth 4 }
      [void]$parts.Add($p.Name + ": " + $txt)
    }
  }
  $detail = ($parts.ToArray() -join " ")
  if ($invalid.Count) { $detail = ($detail + " (" + ($invalid.ToArray() -join ", ") + ")").Trim() }
  # Otra forma: un message suelto, o un cuerpo que no es JSON.
  if (-not $detail) {
    if ($res -and $res.message -is [string]) { $detail = $res.message }
    elseif ($null -eq $res -and $bytes -and $bytes.Length) { $detail = [Text.Encoding]::UTF8.GetString($bytes) }
    $detail = ($detail -replace '\s+', ' ').Trim()
    if ($res -and -not $keys.Count -and -not $invalid.Count) {
      foreach ($p in $res.PSObject.Properties) { if ($p.Name -match $keyOk) { [void]$keys.Add($p.Name) } }
    }
  }
  if ($detail.Length -gt 500) { $detail = $detail.Substring(0, 500) }
  return @{ detail = $detail; keys = [object[]](@($invalid.ToArray()) + @($keys.ToArray())) }
}

function Get-Meta($doc) {
  $m = $doc.metadata
  if ($null -eq $m) { return @{} }
  return @{ kind = [string]$m.qa_kind; line = [string]$m.qa_line; netKey = [string]$m.qa_net; fileName = [string]$m.qa_file }
}
function Get-Info($doc) {
  $r = @($doc.recipients)[0]
  return @{ status = ([string]$doc.status).ToLowerInvariant(); meta = (Get-Meta $doc); name = [string]$r.name; email = [string]$r.email;
            created = [string]$doc.created_at; updated = [string]$doc.updated_at }
}

# Pide a SignWell un documento y anota su estado final en el disco.
# Devuelve $false cuando SignWell no contesto.
function Fetch-Doc($e) {
  try { $r = Invoke-SignWell "GET" ("/documents/" + $e.id) $null } catch { Write-Log ("estado " + $e.id + " sin conexion"); return $false }
  if ($r.code -eq 200) {
    $doc = Read-Json $r.bytes
    if (-not $doc) { Write-Log ("estado " + $e.id + " ilegible"); return $false }
    $info[$e.id] = Get-Info $doc
  } elseif ($r.code -eq 404) {
    $info[$e.id] = @{ status = "missing"; meta = @{}; name = ""; email = ""; created = ""; updated = "" }
  } else {
    Write-Log ("estado " + $e.id + " http " + $r.code); return $false
  }
  # Un firmado sigue firmado: si SignWell ya no lo encuentra (o la clave es
  # de otra cuenta), no pasa a borrable.
  if ($e.status -eq "completed") { $info[$e.id].status = "completed" }
  $st = $info[$e.id].status
  if ($Final -contains $st -and $e.status -ne $st) { $e.status = $st; Save-Docs }
  return $true
}

# Sondeo: solo lo que todavia puede cambiar.
function Update-Pending {
  if (-not $apiKey) { return }
  foreach ($e in @($docs.ToArray())) { if ($Final -notcontains $e.status) { [void](Fetch-Doc $e) } }
}

function Current-Status($e) {
  if ($info.ContainsKey($e.id)) { return $info[$e.id].status }
  if ($e.status) { return $e.status }
  return "unknown"
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
      if ($r.code -lt 200 -or $r.code -ge 300 -or -not $res -or -not ([string]$res.id -match $idOk)) {
        $why = Get-SignWellError $res $r.bytes
        Write-Log ("send http " + $r.code + $(if ($why.keys.Count) { " claves=" + ($why.keys -join ",") } else { "" }))
        $out = @{ error = "signwell"; status = $r.code }
        if ($why.detail) { $out.detail = $why.detail }
        Send-Response $ctx 502 $out; return
      }
      $id = [string]$res.id
      if (-not (Find-Doc $id)) { [void]$docs.Add((New-Entry $id ((Get-Date).ToUniversalTime().ToString("o")) $false "")); Save-Docs }
      $info[$id] = Get-Info $res
      Write-Log ("send " + $id + " test=" + $testMode)
      Send-Response $ctx 200 @{ id = $id; status = $info[$id].status; testMode = $testMode }
    }
    "/list" {
      # Todo lo que espera algo (la firma, o guardarlo en el Network) y,
      # de lo demas, los $limit mas nuevos. total: cuantos hay de lo demas.
      $limit = 25
      if ($null -ne $b.limit) {
        if (-not (($b.limit -is [int]) -or ($b.limit -is [long])) -or $b.limit -lt 1 -or $b.limit -gt 1000) { Send-Response $ctx 400 @{ error = "limit" }; return }
        $limit = [int]$b.limit
      }
      if ($b.refresh -eq $true) { Update-Pending }
      $open = New-Object System.Collections.ArrayList
      $closed = New-Object System.Collections.ArrayList
      for ($i = $docs.Count - 1; $i -ge 0; $i--) {
        $e = $docs[$i]
        if ($Final -contains $e.status -and -not ($e.status -eq "completed" -and -not $e.saved)) { [void]$closed.Add($e) } else { [void]$open.Add($e) }
      }
      $out = New-Object System.Collections.ArrayList
      foreach ($e in (@($open.ToArray()) + @($closed.ToArray() | Select-Object -First $limit))) {
        if (-not $info.ContainsKey($e.id)) { [void](Fetch-Doc $e) }
        $c = $info[$e.id]
        [void]$out.Add(@{ id = $e.id; status = (Current-Status $e); saved = [bool]$e.saved; sent = $e.sent;
          meta = $(if ($c) { $c.meta } else { @{} }); name = $(if ($c) { $c.name } else { "" }); email = $(if ($c) { $c.email } else { "" });
          created = $(if ($c) { $c.created } else { "" }); updated = $(if ($c) { $c.updated } else { "" }) })
      }
      Send-Response $ctx 200 @{ docs = [object[]]$out.ToArray(); total = $closed.Count }
    }
    "/pdf" {
      $e = Find-Doc ([string]$b.id)
      if (-not $e) { Send-Response $ctx 404 @{ error = "id" }; return }
      if ((Current-Status $e) -ne "completed") { Send-Response $ctx 409 @{ error = "no-firmado" }; return }
      try { $r = Invoke-SignWell "GET" ("/documents/" + $e.id + "/completed_pdf?url_only=false") $null } catch { Send-Response $ctx 502 @{ error = "conexion" }; return }
      if ($r.code -ne 200 -or $r.bytes.Length -lt 5 -or [Text.Encoding]::ASCII.GetString($r.bytes, 0, 5) -ne "%PDF-") {
        Write-Log ("pdf " + $e.id + " http " + $r.code)
        Send-Response $ctx 502 @{ error = "signwell"; status = $r.code }; return
      }
      Write-Log ("pdf " + $e.id)
      Send-Response $ctx 200 $null $r.bytes "application/pdf"
    }
    "/saved" {
      # La herramienta ya guardo el PDF en el Network. No se borra nada.
      $e = Find-Doc ([string]$b.id)
      if (-not $e) { Send-Response $ctx 404 @{ error = "id" }; return }
      if ((Current-Status $e) -ne "completed") { Send-Response $ctx 409 @{ error = "no-firmado" }; return }
      if (-not $e.saved) { $e.saved = $true; Save-Docs }
      Write-Log ("saved " + $e.id)
      Send-Response $ctx 200 @{ ok = $true }
    }
    "/delete" {
      # Cancela uno que espera la firma, o borra uno que no se firmo. Un
      # firmado nunca: es el historial. El estado se pregunta otra vez a
      # SignWell justo antes, por si el cliente acaba de firmar.
      $e = Find-Doc ([string]$b.id)
      if (-not $e) { Send-Response $ctx 404 @{ error = "id" }; return }
      if (-not (Fetch-Doc $e)) { Send-Response $ctx 502 @{ error = "conexion" }; return }
      $st = Current-Status $e
      if ($st -eq "completed") { Send-Response $ctx 409 @{ error = "firmado" }; return }
      try { $r = Invoke-SignWell "DELETE" ("/documents/" + $e.id) $null } catch { Send-Response $ctx 502 @{ error = "conexion" }; return }
      if (($r.code -lt 200 -or $r.code -ge 300) -and $r.code -ne 404) { Write-Log ("delete " + $e.id + " http " + $r.code); Send-Response $ctx 502 @{ error = "signwell"; status = $r.code }; return }
      $docs.Remove($e); $info.Remove($e.id); Save-Docs
      Write-Log ("delete " + $e.id + " " + $st)
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
Write-Log ("inicio puerto " + $Port + " test=" + $testMode + " documentos=" + $docs.Count)
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
