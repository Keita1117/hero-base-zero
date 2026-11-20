param(
  [int]$Port = 8765
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$LanIp = (
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "169.254.*" -and
    $_.InterfaceAlias -notmatch "vEthernet|Loopback|Virtual|WSL"
  } |
  Select-Object -First 1 -ExpandProperty IPAddress
)

Write-Host ""
Write-Host "=== HERO BASE ZERO ローカルサーバー起動 ===" -ForegroundColor Cyan
Write-Host "PC確認用URL       : http://localhost:$Port" -ForegroundColor Green
if ($LanIp) {
  Write-Host "同一Wi-Fi確認URL  : http://$($LanIp):$Port" -ForegroundColor Yellow
}
Write-Host "※ AndroidでのPWAインストール・ライブカメラには GitHub Pages 等の HTTPS 公開を推奨します。" -ForegroundColor Gray
Write-Host "停止するには Ctrl + C を押してください。" -ForegroundColor Gray
Write-Host ""

if (Get-Command python -ErrorAction SilentlyContinue) {
  python -m http.server $Port --bind 0.0.0.0
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
  $js = @"
const http = require('http');
const fs = require('fs');
const path = require('path');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const full = path.resolve(process.cwd(), rel);
  if (!full.startsWith(process.cwd()) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404); res.end('Not Found'); return;
  }
  const ext = path.extname(full);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}).listen($Port, '0.0.0.0');
"@
  node -e $js
} else {
  Write-Error "python または node が見つかりません。"
}
