# Chao You Table Tennis - Lightweight Zero-Admin TCP Web Server
# Support PC local access and Android phone local network access with ZERO Admin privileges!

# 1. Get local network IP address (filtering virtual adapters, finding typical 192.168.x.x, 172.x.x.x, 10.x.x.x)
$ipAddresses = Get-NetIPAddress | Where-Object { 
    $_.AddressState -eq "Preferred" -and 
    $_.ValidLifetime -lt ([TimeSpan]::MaxValue) -and 
    ($_.IPAddress -like "192.*" -or $_.IPAddress -like "172.*" -or $_.IPAddress -like "10.*")
}
$ip = ($ipAddresses | Select-Object -First 1).IPAddress

if (!$ip) {
    $ip = "127.0.0.1"
}

# 2. Setup raw TCP Listener with Smart Port Scanning (Zero-Admin required)
$port = 8080
$server = $null
$started = $false

while (!$started -and $port -lt 8100) {
    try {
        # Bind to IPAddress.Any (allows both localhost and external IP connections)
        $server = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Any), $port
        $server.Start()
        $started = $true
    } catch {
        # Port is already in use, increment port and try again
        $port++
    }
}

if (!$started) {
    Write-Host "[ERROR] Could not bind to any free port between 8080 and 8100!" -ForegroundColor Red
    Read-Host "Press Enter to exit..."
    exit
}

$urlLocal = "http://localhost:$port/index.html"
$urlNetwork = "http://$($ip):$port/index.html"

# Automatically open the local website in the default browser at startup
try {
    Start-Process $urlLocal
} catch {
    # Fallback in case Start-Process is restricted
    [System.Diagnostics.Process]::Start($urlLocal)
}

Clear-Host
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  CHAOYOU TABLE TENNIS CLUB - DOUBLE RATING SYSTEM" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Server successfully started and running in background!" -ForegroundColor Green
Write-Host ""
Write-Host " Please keep this window OPEN. Do not close it." -ForegroundColor Gray
Write-Host ""
Write-Host " * PC Access:    " -NoNewline; Write-Host $urlLocal -ForegroundColor Yellow
if ($ip -ne "127.0.0.1") {
    Write-Host " * Phone Access: " -NoNewline; Write-Host $urlNetwork -ForegroundColor Yellow
    Write-Host "   (Note: Both devices MUST be on the same Wi-Fi network!)" -ForegroundColor Gray
} else {
    Write-Host " * Phone Access: Active Wi-Fi network not detected." -ForegroundColor Red
}
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " PWA INSTALLATION GUIDE:" -ForegroundColor Green
Write-Host " 1. Open the link above in Chrome on your PC or Android phone."
Write-Host " 2. Click 'Add to Home Screen' or 'Install' from the Chrome menu."
Write-Host " 3. Enjoy full-screen offline native App experience!"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Press Ctrl+C or close this window to stop the server." -ForegroundColor Gray
Write-Host ""

$currentDir = Get-Location

# 3. Handle raw TCP client connection loop
while ($true) {
    try {
        $client = $server.AcceptTcpClient()
        $stream = $client.GetStream()
        
        # Read the HTTP Request headers (up to 4096 bytes)
        $buffer = New-Object Byte[] 4096
        $bytesRead = $stream.Read($buffer, 0, $buffer.Length)
        if ($bytesRead -eq 0) {
            $client.Close()
            continue
        }
        
        # Find the header boundary \r\n\r\n (bytes 13, 10, 13, 10)
        $headerEnd = -1
        for ($i = 0; $i -le $bytesRead - 4; $i++) {
            if ($buffer[$i] -eq 13 -and $buffer[$i+1] -eq 10 -and $buffer[$i+2] -eq 13 -and $buffer[$i+3] -eq 10) {
                $headerEnd = $i
                break
            }
        }
        
        if ($headerEnd -eq -1) {
            $client.Close()
            continue
        }
        
        $headerBytes = New-Object Byte[] $headerEnd
        [System.Array]::Copy($buffer, 0, $headerBytes, 0, $headerEnd)
        $headerStr = [System.Text.Encoding]::UTF8.GetString($headerBytes)
        
        $firstLine = $headerStr.Split("`r`n")[0]
        
        # The rest of the first read is the beginning of the body
        $bodyStart = $headerEnd + 4
        $bodyAlreadyRead = $bytesRead - $bodyStart
        
        # Parse Content-Length from headers
        $contentLength = 0
        if ($headerStr -match "Content-Length:\s*(\d+)") {
            $contentLength = [int]$Matches[1]
        }
        
        $bodyBytes = New-Object Byte[] $contentLength
        if ($contentLength -gt 0) {
            # Copy the part of the body that was already read
            if ($bodyAlreadyRead -gt 0) {
                $copyLen = [System.Math]::Min($bodyAlreadyRead, $contentLength)
                [System.Array]::Copy($buffer, $bodyStart, $bodyBytes, 0, $copyLen)
                $bytesAccumulated = $copyLen
            } else {
                $bytesAccumulated = 0
            }
            
            # Read the rest of the body from the stream
            while ($bytesAccumulated -lt $contentLength) {
                $bytesToRead = $contentLength - $bytesAccumulated
                $read = $stream.Read($bodyBytes, $bytesAccumulated, $bytesToRead)
                if ($read -eq 0) {
                    break
                }
                $bytesAccumulated += $read
            }
        }
        
        # Parse the HTTP Request Method and Path
        if ($firstLine -match "^([A-Z]+)\s+([^\s\?]+)") {
            $method = $Matches[1]
            $urlPath = [System.Uri]::UnescapeDataString($Matches[2])
            
            if ($method -eq "OPTIONS") {
                # Handle CORS preflight
                $header = "HTTP/1.1 200 OK`r`n" +
                          "Access-Control-Allow-Origin: *`r`n" +
                          "Access-Control-Allow-Methods: GET, POST, OPTIONS`r`n" +
                          "Access-Control-Allow-Headers: Content-Type`r`n" +
                          "Content-Length: 0`r`n" +
                          "Connection: close`r`n`r`n"
                $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                $stream.Write($headerBytes, 0, $headerBytes.Length)
            }
            elseif ($urlPath -eq "/api/db") {
                if ($method -eq "GET") {
                    $dbPath = Join-Path $currentDir "database.json"
                    $dbBytes = $null
                    if (Test-Path $dbPath -PathType Leaf) {
                        $dbBytes = [System.IO.File]::ReadAllBytes($dbPath)
                    } else {
                        $dbBytes = [System.Text.Encoding]::UTF8.GetBytes("{}")
                    }
                    
                    $header = "HTTP/1.1 200 OK`r`n" +
                              "Content-Type: application/json; charset=utf-8`r`n" +
                              "Access-Control-Allow-Origin: *`r`n" +
                              "Content-Length: $($dbBytes.Length)`r`n" +
                              "Connection: close`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($dbBytes, 0, $dbBytes.Length)
                }
                elseif ($method -eq "POST") {
                    $dbPath = Join-Path $currentDir "database.json"
                    [System.IO.File]::WriteAllBytes($dbPath, $bodyBytes)
                    
                    $respBody = '{"status":"ok"}'
                    $respBytes = [System.Text.Encoding]::UTF8.GetBytes($respBody)
                    $header = "HTTP/1.1 200 OK`r`n" +
                              "Content-Type: application/json; charset=utf-8`r`n" +
                              "Access-Control-Allow-Origin: *`r`n" +
                              "Content-Length: $($respBytes.Length)`r`n" +
                              "Connection: close`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($respBytes, 0, $respBytes.Length)
                }
            }
            else {
                # Regular static file serving (GET only)
                if ($method -eq "GET") {
                    if ($urlPath -eq "/") {
                        $urlPath = "/index.html"
                    }
                    
                    $safeFileName = $urlPath.TrimStart('/')
                    $filePath = Join-Path $currentDir $safeFileName
                    
                    if (Test-Path $filePath -PathType Leaf) {
                        $bytes = [System.IO.File]::ReadAllBytes($filePath)
                        
                        # Determine Content-Type
                        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                        $mime = "text/plain"
                        switch ($ext) {
                            ".html" { $mime = "text/html; charset=utf-8" }
                            ".htm"  { $mime = "text/html; charset=utf-8" }
                            ".css"  { $mime = "text/css; charset=utf-8" }
                            ".js"   { $mime = "application/javascript; charset=utf-8" }
                            ".json" { $mime = "application/json; charset=utf-8" }
                            ".svg"  { $mime = "image/svg+xml; charset=utf-8" }
                            ".png"  { $mime = "image/png" }
                            ".jpg"  { $mime = "image/jpeg" }
                            ".jpeg" { $mime = "image/jpeg" }
                            ".webp" { $mime = "image/webp" }
                            ".ico"  { $mime = "image/x-icon" }
                        }
                        
                        $cacheHeader = ""
                        $fileName = [System.IO.Path]::GetFileName($filePath).ToLower()
                        if ($fileName -eq "sw.js" -or $fileName -eq "index.html") {
                            $cacheHeader = "Cache-Control: no-cache, no-store, must-revalidate`r`n"
                        }
                        
                        $header = "HTTP/1.1 200 OK`r`n" +
                                  "Content-Type: $mime`r`n" +
                                  "Access-Control-Allow-Origin: *`r`n" +
                                  $cacheHeader +
                                  "Content-Length: $($bytes.Length)`r`n" +
                                  "Connection: close`r`n`r`n"
                        
                        $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                        $stream.Write($headerBytes, 0, $headerBytes.Length)
                        $stream.Write($bytes, 0, $bytes.Length)
                    } else {
                        # 404 File Not Found
                        $errBody = "<h1>404 Not Found</h1><p>Requested file was not found.</p>"
                        $errBytes = [System.Text.Encoding]::UTF8.GetBytes($errBody)
                        $header = "HTTP/1.1 404 Not Found`r`n" +
                                  "Content-Type: text/html; charset=utf-8`r`n" +
                                  "Access-Control-Allow-Origin: *`r`n" +
                                  "Content-Length: $($errBytes.Length)`r`n" +
                                  "Connection: close`r`n`r`n"
                        
                        $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                        $stream.Write($headerBytes, 0, $headerBytes.Length)
                        $stream.Write($errBytes, 0, $errBytes.Length)
                    }
                } else {
                    # 405 Method Not Allowed
                    $errBody = "<h1>405 Method Not Allowed</h1>"
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes($errBody)
                    $header = "HTTP/1.1 405 Method Not Allowed`r`n" +
                              "Content-Type: text/html; charset=utf-8`r`n" +
                              "Access-Control-Allow-Origin: *`r`n" +
                              "Content-Length: $($errBytes.Length)`r`n" +
                              "Connection: close`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($errBytes, 0, $errBytes.Length)
                }
            }
        }
        
        $stream.Close()
        $client.Close()
    } catch {
        if ($null -ne $stream) { $stream.Close() }
        if ($null -ne $client) { $client.Close() }
    }
}
