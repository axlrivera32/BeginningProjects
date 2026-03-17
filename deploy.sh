#!/bin/bash
set -e

# NexDeFi Production Deployment Script
# Usage: ./deploy.sh

echo "=========================================="
echo "NexDeFi Production Deployment"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env.production ]; then
    echo -e "${RED}Error: .env.production file not found!${NC}"
    echo "Copy .env.production.example to .env.production and update the values"
    exit 1
fi

echo -e "${YELLOW}Step 1: Stopping existing containers...${NC}"
docker compose -f docker-compose.prod.yml down || true

echo -e "${YELLOW}Step 2: Pulling latest images...${NC}"
docker compose -f docker-compose.prod.yml pull

echo -e "${YELLOW}Step 3: Building images...${NC}"
docker compose -f docker-compose.prod.yml build --no-cache

echo -e "${YELLOW}Step 4: Starting services...${NC}"
docker compose -f docker-compose.prod.yml up -d

echo -e "${YELLOW}Step 5: Running database migrations...${NC}"
# Wait for backend to be ready
sleep 10
docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head || echo "Note: Ensure your backend has migration scripts set up"

echo -e "${YELLOW}Step 6: Checking service health...${NC}"
sleep 5
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Services are healthy${NC}"
else
    echo -e "${RED}✗ Health check failed${NC}"
    docker compose -f docker-compose.prod.yml logs
    exit 1
fi

echo -e "${GREEN}=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo "Frontend: https://yourdomain.com"
echo "API: https://api.yourdomain.com"
echo "=========================================="
