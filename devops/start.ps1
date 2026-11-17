$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'
$composeFile = Join-Path $PSScriptRoot 'compose.yaml'
$composeArgs = @('compose', '--env-file', $envFile, '-f', $composeFile)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI was not found. Install Docker Desktop and enable its WSL 2 backend.'
}

function Test-DockerEngine {
    # Native stderr must not be promoted to a terminating PowerShell 5.1 error.
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & docker info 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

if (-not (Test-DockerEngine)) {
    $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path -LiteralPath $desktop)) {
        throw 'Docker Engine is unavailable and Docker Desktop was not found. Start Docker Desktop and check WSL 2.'
    }
    Write-Host 'Starting Docker Desktop; waiting up to 120 seconds for Docker Engine...'
    Start-Process -FilePath $desktop -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(120)
    do {
        Start-Sleep -Seconds 3
        if (Test-DockerEngine) { break }
    } while ((Get-Date) -lt $deadline)
    if (-not (Test-DockerEngine)) {
        throw 'Docker Engine did not start within 120 seconds. Open Docker Desktop and check its WSL 2 backend and diagnostics.'
    }
}

if (-not (Test-Path -LiteralPath $envFile)) {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $password = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    $content = "# Use long random hexadecimal values`r`nPOSTGRES_PASSWORD=$password`r`nPOLYMAP_ORIGINS=`r`n"
    # CreateNew prevents overwriting a file created by another process.
    $stream = New-Object System.IO.FileStream($envFile, [System.IO.FileMode]::CreateNew)
    try {
        $writer = New-Object System.IO.StreamWriter($stream, [System.Text.Encoding]::ASCII)
        try { $writer.Write($content) } finally { $writer.Dispose() }
    } finally { $stream.Dispose() }
    Write-Host 'Created .env with a random PostgreSQL password.'
}

$passwordLine = @(Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*POSTGRES_PASSWORD\s*=' })
if ($passwordLine.Count -ne 1) {
    throw '.env must contain exactly one non-empty POSTGRES_PASSWORD.'
}
$password = ($passwordLine[0] -replace '^\s*POSTGRES_PASSWORD\s*=\s*', '').Trim()
if ($password -match '^(""|\x27\x27)?\s*(#.*)?$') {
    throw '.env must contain a non-empty POSTGRES_PASSWORD.'
}
if ($env:POSTGRES_PASSWORD -and $env:POSTGRES_PASSWORD -ne $password.Trim('"', "'")) {
    throw 'POSTGRES_PASSWORD in the environment differs from .env. Clear the environment variable before starting.'
}

& docker @composeArgs config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose configuration validation failed.' }
for ($attempt = 1; $attempt -le 3; $attempt++) {
    & docker @composeArgs up -d --build
    if ($LASTEXITCODE -eq 0) { break }
    if ($attempt -eq 3) { throw 'Docker Compose build or startup failed after 3 attempts. Check the errors above.' }
    Write-Host 'Docker Compose failed; retrying in 5 seconds in case of a temporary network error...'
    Start-Sleep -Seconds 5
}

Write-Host 'Waiting for the API and map data...'
$deadline = (Get-Date).AddSeconds(120)
do {
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/maps/current' -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            $running = @(& docker @composeArgs ps --services --filter 'status=running')
            if ($LASTEXITCODE -eq 0 -and @('postgres', 'api', 'web' | Where-Object { $_ -notin $running }).Count -eq 0) {
                $postgresId = & docker @composeArgs ps -q postgres
                if ($LASTEXITCODE -eq 0 -and $postgresId) {
                    $health = & docker inspect --format '{{.State.Health.Status}}' $postgresId
                    if ($LASTEXITCODE -eq 0 -and $health -eq 'healthy') {
                        Write-Host 'PolyMap is ready: http://localhost:8080'
                        exit 0
                    }
                }
            }
        }
    } catch { }
    Start-Sleep -Seconds 3
} while ((Get-Date) -lt $deadline)

& docker @composeArgs ps
throw 'PolyMap did not become ready within 120 seconds. Inspect Docker Compose logs for postgres, api and web.'
