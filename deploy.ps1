# NexDeFi Production Deployment Script (Windows PowerShell)
# Usage: .\deploy.ps1

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "NexDeFi Production Deployment (Docker)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Check if .env.production exists
if (-not (Test-Path ".env.production")) {
    Write-Host "Error: .env.production file not found!" -ForegroundColor Red
    Write-Host "Copy .env.production.example to .env.production and update the values"
    exit 1
}

# Step 1: Stop existing containers
Write-Host "`nStep 1: Stopping existing containers..." -ForegroundColor Yellow
docker compose -f docker-compose.prod.yml down

# Step 2: Pull latest images
Write-Host "`nStep 2: Pulling latest images..." -ForegroundColor Yellow
docker compose -f docker-compose.prod.yml pull

# Step 3: Build images
Write-Host "`nStep 3: Building images..." -ForegroundColor Yellow
docker compose -f docker-compose.prod.yml build --no-cache

# Step 4: Start services
Write-Host "`nStep 4: Starting services..." -ForegroundColor Yellow
docker compose -f docker-compose.prod.yml up -d

# Step 5: Wait and verify
Write-Host "`nStep 5: Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Step 6: Check service health
Write-Host "`nStep 6: Checking service health..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
$healthy = $false

while ($attempt -lt $maxAttempts -and -not $healthy) {
    try {
        $response = curl.exe -f http://localhost/health 2>$null
        if ($LASTEXITCODE -eq 0) {
            $healthy = $true
            Write-Host "✓ Services are healthy" -ForegroundColor Green
        }
    } catch {
        # Continue
    }
    
    if (-not $healthy) {
        $attempt++
        Start-Sleep -Seconds 1
    }
}

if (-not $healthy) {
    Write-Host "✗ Health check failed" -ForegroundColor Red
    docker compose -f docker-compose.prod.yml logs
    exit 1
}

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Frontend: https://yourdomain.com"
Write-Host "API: https://api.yourdomain.com"
Write-Host "==========================================" -ForegroundColor Green
