# Q Agency Toolbox - ayudante de firma (DocuSeal).
# Escucha solo en 127.0.0.1. La herramienta le pasa en JSON el Consent o el
# SOA que hay que firmar; el ayudante guarda la clave de la API del servidor
# de firmas (cifrada con DPAPI, solo la lee este usuario de Windows), hace las
# llamadas y entrega el PDF firmado a la herramienta, que lo guarda en el
# Network. Los envios viven en el servidor: son el historial de todo el
# equipo, y ahi mismo se marca cuales ya se guardaron. En el disco no guarda
# nada de los envios.
# Rutas: GET /health; POST /send, /list, /pdf, /saved, /delete, /agent (con X-Helper-Token).
# (Los mensajes van sin acentos para que se lean bien en cualquier consola.)
param(
  [int]$Port = 47815,
  [string]$Dir = (Join-Path $env:LOCALAPPDATA "QAgencyToolbox\firma"),
  # Solo para las pruebas: la direccion de la API. Normalmente sale del
  # servidor de ajustes.json.
  [string]$ApiBase = ""
)

$ErrorActionPreference = "Stop"
$Version = "3"
Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Security
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$claveFile = Join-Path $Dir "clave.txt"
$tokenFile = Join-Path $Dir "token.txt"
$ajustesFile = Join-Path $Dir "ajustes.json"
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

# El servidor: ajustes.json {"server": "https://firmas.ejemplo.com"}, solo
# https y sin ruta. Sin servidor valido el ayudante no envia nada.
if (-not $ApiBase) {
  try {
    $aj = Get-Content -LiteralPath $ajustesFile -Raw | ConvertFrom-Json
    $srv = [string]$aj.server
    if ($srv -match '^https://[A-Za-z0-9.-]+(:\d{1,5})?/?$') { $ApiBase = $srv.TrimEnd("/") + "/api" }
  } catch { }
  if (-not $ApiBase) { Write-Log "sin servidor" }
}
# Los enlaces para firmar van al mismo servidor: {servidor}/s/{slug}.
$SiteBase = if ($ApiBase) { $ApiBase -replace '/api$', '' } else { "" }

$idOk = '^\d{1,12}$'

# Sin redirecciones automaticas: HttpClient reenviaria X-Auth-Token al
# servidor al que se redirija. Las del PDF se siguen a mano y sin la clave.
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AllowAutoRedirect = $false
$http = New-Object System.Net.Http.HttpClient($handler)
$http.Timeout = [TimeSpan]::FromSeconds(30)
function Read-Result($res) {
  return @{ code = [int]$res.StatusCode; bytes = $res.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult();
            type = [string]$res.Content.Headers.ContentType }
}
function Invoke-DocuSeal([string]$method, [string]$path, $body) {
  $uri = New-Object System.Uri ($ApiBase + $path)
  $req = New-Object System.Net.Http.HttpRequestMessage ([System.Net.Http.HttpMethod]::new($method)), $uri
  $req.Headers.Add("X-Auth-Token", $apiKey)
  $req.Headers.Add("Accept", "application/json")
  if ($null -ne $body) {
    $req.Content = New-Object System.Net.Http.StringContent ((ConvertTo-Json -InputObject $body -Depth 8 -Compress), [Text.Encoding]::UTF8, "application/json")
    # El tipo exacto, sin "; charset=utf-8" (el cuerpo sigue en UTF-8).
    $req.Content.Headers.ContentType = New-Object System.Net.Http.Headers.MediaTypeHeaderValue("application/json")
  }
  return (Read-Result ($http.SendAsync($req).GetAwaiter().GetResult()))
}
# Un archivo del servidor (el PDF): sin la clave, siguiendo hasta 3
# redirecciones http o https.
function Get-File([System.Uri]$uri) {
  for ($i = 0; $i -lt 4; $i++) {
    if (@("https", "http") -notcontains $uri.Scheme) { return @{ code = 502; bytes = [byte[]]@(); type = "" } }
    $res = $http.GetAsync($uri).GetAwaiter().GetResult()
    $code = [int]$res.StatusCode
    if (@(301, 302, 303, 307, 308) -notcontains $code -or -not $res.Headers.Location) { return (Read-Result $res) }
    $to = $res.Headers.Location
    if (-not $to.IsAbsoluteUri) { $to = New-Object System.Uri ($uri, $to) }
    $uri = $to
  }
  return @{ code = 502; bytes = [byte[]]@(); type = "" }
}
function Read-Json($bytes) {
  try { return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json) } catch { return $null }
}

# Por que el servidor rechazo algo: el texto va a la herramienta (para que se
# vea que corregir), nunca al registro.
function Get-ServerError($res, [byte[]]$bytes) {
  $detail = ""
  if ($res -and $res.error -is [string]) { $detail = $res.error }
  elseif ($res -and $res.message -is [string]) { $detail = $res.message }
  elseif ($null -eq $res -and $bytes -and $bytes.Length) { $detail = [Text.Encoding]::UTF8.GetString($bytes) }
  $detail = ($detail -replace '\s+', ' ').Trim()
  if ($detail.Length -gt 500) { $detail = $detail.Substring(0, 500) }
  return $detail
}
function Server-Failure($ctx, [string]$what, $r) {
  Write-Log ($what + " http " + $r.code)
  $out = @{ error = "docuseal"; status = $r.code }
  $why = Get-ServerError (Read-Json $r.bytes) $r.bytes
  if ($why) { $out.detail = $why }
  Send-Response $ctx 502 $out
}

# Un envio del servidor, leido para la herramienta. El Cliente lleva los
# datos del envio en su metadata; en el SOA el Agente firma despues.
function Get-Role($sub, [string]$role) {
  foreach ($s in @($sub.submitters)) { if ([string]$s.role -eq $role) { return $s } }
  return $null
}
function Get-Status($sub) {
  $c = Get-Role $sub "Cliente"
  $a = Get-Role $sub "Agente"
  if ([string]$sub.status -eq "completed" -or ($c.completed_at -and (-not $a -or $a.completed_at))) { return "completed" }
  foreach ($s in @($sub.submitters)) { if ($s.declined_at) { return "declined" } }
  if ($sub.expire_at) {
    try { if ([datetime]::Parse([string]$sub.expire_at).ToUniversalTime() -lt (Get-Date).ToUniversalTime()) { return "expired" } } catch { }
  }
  if ($c.completed_at) { return "agent" }
  if ($c.opened_at) { return "viewed" }
  return "sent"
}
function Get-Link($s) {
  if ($s -and ([string]$s.slug) -match '^[A-Za-z0-9_-]{1,100}$') { return $SiteBase + "/s/" + $s.slug }
  return $null
}
function Get-Doc($sub) {
  $c = Get-Role $sub "Cliente"
  $m = $c.metadata
  $st = Get-Status $sub
  $d = [ordered]@{
    id = [string]$sub.id; status = $st; saved = ([string]$m.qa_saved -eq "1")
    meta = @{ kind = [string]$m.qa_kind; line = [string]$m.qa_line; netKey = [string]$m.qa_net; fileName = [string]$m.qa_file }
    agent = [string]$m.qa_agent; name = [string]$c.name; email = [string]$c.email; created = [string]$sub.created_at
  }
  if (@("sent", "viewed") -contains $st) { $link = Get-Link $c; if ($link) { $d.link = $link } }
  return $d
}
# Pide un envio. Devuelve @{ sub } o @{ code } (404 si no existe, 502 si el
# servidor no contesto bien).
function Fetch-Sub([string]$id) {
  try { $r = Invoke-DocuSeal "GET" ("/submissions/" + $id) $null } catch { Write-Log ("envio " + $id + " sin conexion"); return @{ code = 502 } }
  if ($r.code -eq 404) { return @{ code = 404 } }
  $sub = if ($r.code -eq 200) { Read-Json $r.bytes } else { $null }
  if (-not $sub -or $sub.archived_at) {
    if ($sub) { return @{ code = 404 } }
    Write-Log ("envio " + $id + " http " + $r.code); return @{ code = 502 }
  }
  return @{ sub = $sub }
}
# Una pagina de envios, lo mas nuevo primero. $null si el servidor fallo.
function Get-Page([string]$query) {
  try { $r = Invoke-DocuSeal "GET" ("/submissions?" + $query) $null } catch { Write-Log "lista sin conexion"; return $null }
  $res = if ($r.code -eq 200) { Read-Json $r.bytes } else { $null }
  if (-not $res) { Write-Log ("lista http " + $r.code); return $null }
  # La coma: una lista vacia devuelta tal cual llegaria como $null.
  return , @($res.data)
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
function Email-Ok($s) { return (Text-Ok $s 200) -and $s -match '^[^\s@]+@[^\s@]+\.[^\s@]+$' }

# Campos {name, value}: el nombre es el del campo del PDF. Un valor vacio
# no se manda (el campo queda libre). $null si algo no es valido.
function Read-Fields($list) {
  $out = New-Object System.Collections.ArrayList
  $all = @($list)
  if ($all.Count -gt 60) { return $null }
  foreach ($f in $all) {
    if ($null -eq $f) { continue }
    if (-not (Text-Ok $f.name 200)) { return $null }
    if ($null -eq $f.value -or "$($f.value)".Trim() -eq "") { continue }
    if (-not ($f.value -is [string]) -or $f.value.Length -gt 500) { return $null }
    [void]$out.Add([ordered]@{ name = $f.name; value = $f.value.Trim() })
  }
  return , $out
}

# Lo que llega se revisa campo por campo antes de pasarlo al servidor.
function Build-Submission($b) {
  if (-not ((Text-Ok $b.templateId 12) -and $b.templateId -match $idOk)) { return $null }
  if (-not ((Text-Ok $b.recipient.name 200) -and (Email-Ok $b.recipient.email))) { return $null }
  if (@("consent", "soa") -notcontains $b.meta.kind) { return $null }
  if (-not ((Text-Ok $b.meta.fileName 200) -and ([string]$b.meta.line -match '^[a-z]{0,10}$') -and ([string]$b.meta.netKey -match '^[a-z]{1,20}$'))) { return $null }
  $fields = Read-Fields $b.fields
  if ($null -eq $fields) { return $null }
  $meta = [ordered]@{ qa_kind = $b.meta.kind; qa_line = [string]$b.meta.line; qa_net = $b.meta.netKey; qa_file = $b.meta.fileName }
  if (Text-Ok $b.requester 100) { $meta.qa_agent = $b.requester }
  $cliente = [ordered]@{ role = "Cliente"; name = $b.recipient.name; email = $b.recipient.email; order = 0; metadata = $meta
    fields = [object[]]@($fields | ForEach-Object { [ordered]@{ name = $_.name; default_value = $_.value; readonly = $true } }) }
  $subs = @($cliente)
  if ($b.meta.kind -eq "soa") {
    # El agente firma despues del cliente. Sus datos viajan en su metadata y
    # se llenan (bloqueados) recien cuando el cliente firmo: ver /agent.
    $a = $b.agent
    if ($null -eq $a -or -not (Text-Ok $a.name 200)) { return $null }
    if ($null -ne $a.email -and "$($a.email)" -ne "" -and -not (Email-Ok $a.email)) { return $null }
    if ($null -ne $a.dateField -and "$($a.dateField)" -ne "" -and -not (Text-Ok $a.dateField 200)) { return $null }
    $af = Read-Fields $a.fields
    if ($null -eq $af) { return $null }
    $am = [ordered]@{ qa_fields = (ConvertTo-Json -InputObject ([object[]]$af.ToArray()) -Compress -Depth 4) }
    if (Text-Ok $a.dateField 200) { $am.qa_date_field = $a.dateField }
    $agente = [ordered]@{ role = "Agente"; name = $a.name; order = 1; metadata = $am }
    if (Email-Ok $a.email) { $agente.email = $a.email }
    $subs += $agente
  }
  return [ordered]@{ template_id = [long]$b.templateId; send_email = $false; order = "preserved"; submitters = [object[]]$subs }
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
  $problem = if (-not $apiKey) { "sin-clave" } elseif (-not $ApiBase) { "sin-servidor" } else { $null }
  if ($route -eq "GET /health") {
    Send-Response $ctx 200 ([ordered]@{ ok = (-not $problem); version = $Version; error = $problem })
    return
  }
  if (-not (Test-Token ([string]$req.Headers["X-Helper-Token"]))) { Write-Log ("rechazado token " + $route); Send-Response $ctx 401 @{ error = "token" }; return }
  if ($req.HttpMethod -ne "POST") { Send-Response $ctx 405 @{ error = "method" }; return }
  if (-not ([string]$req.ContentType).StartsWith("application/json")) { Write-Log ("rechazado tipo " + $route); Send-Response $ctx 415 @{ error = "content-type" }; return }
  $in = Read-Body $req
  if ($in.tooBig) { Send-Response $ctx 413 @{ error = "too-big" }; return }
  if ($in.bad) { Send-Response $ctx 400 @{ error = "json" }; return }
  $b = $in.json
  if ($problem) { Send-Response $ctx 503 @{ error = $problem }; return }
  # Las rutas que trabajan con un envio: su numero, solo digitos.
  if (@("/pdf", "/saved", "/delete", "/agent") -contains $path -and -not ([string]$b.id -match $idOk)) { Send-Response $ctx 400 @{ error = "id" }; return }

  switch ($path) {
    "/send" {
      $doc = Build-Submission $b
      if ($null -eq $doc) { Write-Log "send invalido"; Send-Response $ctx 400 @{ error = "datos" }; return }
      try { $r = Invoke-DocuSeal "POST" "/submissions" $doc } catch { Write-Log "send sin conexion"; Send-Response $ctx 502 @{ error = "conexion" }; return }
      $res = Read-Json $r.bytes
      $c = $null
      if ($r.code -ge 200 -and $r.code -lt 300 -and $res) { foreach ($s in @($res)) { if ([string]$s.role -eq "Cliente") { $c = $s } } }
      if (-not $c -or -not ([string]$c.submission_id -match $idOk)) { Server-Failure $ctx "send" $r; return }
      $id = [string]$c.submission_id
      $link = if (([string]$c.embed_src) -match '^https?://') { [string]$c.embed_src } else { Get-Link $c }
      Write-Log ("send " + $id + " " + $b.meta.kind)
      Send-Response $ctx 200 ([ordered]@{ id = $id; link = $link })
    }
    "/list" {
      # Los $limit mas nuevos del equipo y, ademas, todo lo que espera una
      # firma (aunque sea viejo). more: si hay mas viejos que pedir.
      $limit = 25
      if ($null -ne $b.limit) {
        if (-not (($b.limit -is [int]) -or ($b.limit -is [long])) -or $b.limit -lt 1 -or $b.limit -gt 1000) { Send-Response $ctx 400 @{ error = "limit" }; return }
        $limit = [int]$b.limit
      }
      $byId = @{}
      $newest = New-Object System.Collections.ArrayList
      $after = ""
      $more = $false
      while ($newest.Count -lt $limit) {
        $want = [Math]::Min(100, $limit - $newest.Count + 1)
        $page = Get-Page ("limit=" + $want + $after)
        if ($null -eq $page) { Send-Response $ctx 502 @{ error = "conexion" }; return }
        foreach ($s in $page) {
          if ($newest.Count -ge $limit) { $more = $true; break }
          [void]$newest.Add($s)
        }
        if ($page.Count -lt $want -or $more) { break }
        $after = "&after=" + $page[$page.Count - 1].id
      }
      foreach ($s in $newest) { $byId[[string]$s.id] = $s }
      $pending = Get-Page "status=pending&limit=100"
      if ($null -eq $pending) { Send-Response $ctx 502 @{ error = "conexion" }; return }
      foreach ($s in $pending) { $byId[[string]$s.id] = $s }
      $docs = @($byId.Values | Sort-Object { [long]$_.id } -Descending | ForEach-Object { Get-Doc $_ })
      Send-Response $ctx 200 ([ordered]@{ docs = [object[]]$docs; more = $more })
    }
    "/pdf" {
      $f = Fetch-Sub ([string]$b.id)
      if (-not $f.sub) { Send-Response $ctx $f.code @{ error = $(if ($f.code -eq 404) { "id" } else { "conexion" }) }; return }
      if ((Get-Status $f.sub) -ne "completed") { Send-Response $ctx 409 @{ error = "no-firmado" }; return }
      try { $r = Invoke-DocuSeal "GET" ("/submissions/" + $b.id + "/documents?merge=true") $null } catch { Send-Response $ctx 502 @{ error = "conexion" }; return }
      $res = if ($r.code -eq 200) { Read-Json $r.bytes } else { $null }
      $url = [string](@($res.documents) | Select-Object -First 1).url
      if (-not ($url -match '^https?://')) { Server-Failure $ctx ("pdf " + $b.id) $r; return }
      try { $p = Get-File (New-Object System.Uri $url) } catch { Send-Response $ctx 502 @{ error = "conexion" }; return }
      if ($p.code -ne 200 -or $p.bytes.Length -lt 5 -or [Text.Encoding]::ASCII.GetString($p.bytes, 0, 5) -ne "%PDF-") {
        Write-Log ("pdf " + $b.id + " archivo http " + $p.code)
        Send-Response $ctx 502 @{ error = "docuseal"; status = $p.code }; return
      }
      Write-Log ("pdf " + $b.id)
      Send-Response $ctx 200 $null $p.bytes "application/pdf"
    }
    "/saved" {
      # La herramienta ya guardo el PDF en el Network: queda marcado en el
      # servidor, para que ninguna otra computadora lo vuelva a guardar.
      $f = Fetch-Sub ([string]$b.id)
      if (-not $f.sub) { Send-Response $ctx $f.code @{ error = $(if ($f.code -eq 404) { "id" } else { "conexion" }) }; return }
      if ((Get-Status $f.sub) -ne "completed") { Send-Response $ctx 409 @{ error = "no-firmado" }; return }
      $c = Get-Role $f.sub "Cliente"
      $meta = [ordered]@{}
      if ($c.metadata) { foreach ($p in $c.metadata.PSObject.Properties) { $meta[$p.Name] = $p.Value } }
      if ([string]$meta.qa_saved -ne "1") {
        $meta.qa_saved = "1"
        try { $r = Invoke-DocuSeal "PUT" ("/submitters/" + $c.id) @{ metadata = $meta } } catch { Send-Response $ctx 502 @{ error = "conexion" }; return }
        if ($r.code -lt 200 -or $r.code -ge 300) { Server-Failure $ctx ("saved " + $b.id) $r; return }
      }
      Write-Log ("saved " + $b.id)
      Send-Response $ctx 200 @{ ok = $true }
    }
    "/delete" {
      # Cancela uno que espera la firma, o quita uno que no se firmo: se
      # archiva en el servidor. Un firmado nunca. El estado se pregunta otra
      # vez justo antes, por si el cliente acaba de firmar.
      $f = Fetch-Sub ([string]$b.id)
      if (-not $f.sub) { Send-Response $ctx $f.code @{ error = $(if ($f.code -eq 404) { "id" } else { "conexion" }) }; return }
      $st = Get-Status $f.sub
      if ($st -eq "completed") { Send-Response $ctx 409 @{ error = "firmado" }; return }
      try { $r = Invoke-DocuSeal "DELETE" ("/submissions/" + $b.id) $null } catch { Send-Response $ctx 502 @{ error = "conexion" }; return }
      if (($r.code -lt 200 -or $r.code -ge 300) -and $r.code -ne 404) { Server-Failure $ctx ("delete " + $b.id) $r; return }
      Write-Log ("delete " + $b.id + " " + $st)
      Send-Response $ctx 200 @{ ok = $true }
    }
    "/agent" {
      # SOA: el cliente ya firmo. Se llenan y bloquean los datos del agente
      # (los que vinieron con el envio y la fecha de la cita = el dia en que
      # firmo el cliente) y se devuelve el enlace del agente: solo firma.
      $f = Fetch-Sub ([string]$b.id)
      if (-not $f.sub) { Send-Response $ctx $f.code @{ error = $(if ($f.code -eq 404) { "id" } else { "conexion" }) }; return }
      $c = Get-Role $f.sub "Cliente"
      $a = Get-Role $f.sub "Agente"
      if (-not $a -or [string]$c.metadata.qa_kind -ne "soa") { Send-Response $ctx 409 @{ error = "no-soa" }; return }
      if ($a.completed_at) { Send-Response $ctx 409 @{ error = "firmado" }; return }
      if (-not $c.completed_at) { Send-Response $ctx 409 @{ error = "cliente" }; return }
      $put = New-Object System.Collections.ArrayList
      # (Sin @( ) alrededor: en PowerShell 5.1 una lista JSON sale entera por
      # la tuberia y @( ) la meteria dentro de otra lista.)
      try { $saved = [string]$a.metadata.qa_fields | ConvertFrom-Json } catch { $saved = $null }
      foreach ($x in (Read-Fields $saved)) { [void]$put.Add([ordered]@{ name = $x.name; default_value = $x.value; readonly = $true }) }
      $dateField = [string]$a.metadata.qa_date_field
      if (Text-Ok $dateField 200) {
        $signed = [datetime]::Parse([string]$c.completed_at, [Globalization.CultureInfo]::InvariantCulture).ToLocalTime()
        [void]$put.Add([ordered]@{ name = $dateField; default_value = $signed.ToString("MM/dd/yyyy", [Globalization.CultureInfo]::InvariantCulture); readonly = $true })
      }
      if ($put.Count) {
        try { $r = Invoke-DocuSeal "PUT" ("/submitters/" + $a.id) @{ fields = [object[]]$put.ToArray() } } catch { Send-Response $ctx 502 @{ error = "conexion" }; return }
        if ($r.code -lt 200 -or $r.code -ge 300) { Server-Failure $ctx ("agent " + $b.id) $r; return }
      }
      $link = Get-Link $a
      if (-not $link) { Send-Response $ctx 502 @{ error = "docuseal"; status = 200 }; return }
      Write-Log ("agent " + $b.id)
      Send-Response $ctx 200 @{ link = $link }
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
Write-Log ("inicio puerto " + $Port + " version " + $Version)
$wait = $listener.GetContextAsync()
while ($listener.IsListening) {
  if ($wait.AsyncWaitHandle.WaitOne(1000)) {
    try { Handle $wait.Result } catch {
      Write-Log "error interno"
      try { $wait.Result.Response.StatusCode = 500; $wait.Result.Response.Close() } catch { }
    }
    $wait = $listener.GetContextAsync()
  }
}
