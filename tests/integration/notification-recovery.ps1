$ErrorActionPreference = 'Stop'
$base = if ($env:EVENTHUB_URL) { $env:EVENTHUB_URL } else { 'http://127.0.0.1:8080' }
$initial = Invoke-RestMethod "$base/api/status"
if ($initial.status -ne 'ready') { throw 'O ambiente deve estar pronto antes do teste.' }
try {
  docker compose stop notifications
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao parar Notification.' }
  $code = & curl.exe --silent --output NUL --write-out '%{http_code}' "$base/api/status"
  if ($code -ne '503') { throw "Esperado 503, recebido $code" }
  $raw = & curl.exe --silent "$base/api/status"
  $body = $raw | ConvertFrom-Json
  if (($body.services | Where-Object name -eq notifications).status -ne 'unavailable') { throw 'Falha não detectada.' }
  if (@($body.services | Where-Object { $_.name -ne 'notifications' -and $_.status -ne 'ready' }).Count -gt 0) { throw 'Outros servicos foram afetados.' }
  Write-Output 'Indisponibilidade isolada detectada corretamente.'
}
finally {
  docker compose start notifications
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao reiniciar Notification.' }
}
$recovered = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  try {
    $body = Invoke-RestMethod "$base/api/status"
    if ($body.status -eq 'ready') { $recovered = $true; break }
  } catch {}
  Start-Sleep -Seconds 1
}
if (-not $recovered) { throw 'Notification nao se recuperou no prazo.' }
Write-Output 'Recuperacao confirmada.'

