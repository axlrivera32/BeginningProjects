# NexDeFi Production Server Setup Guide

## Prerequisites

Before starting, ensure you have:
- A Linux server (Ubuntu 20.04+ or CentOS 7+) with at least 2GB RAM and 20GB storage
- Domain name pointing to your server IP
- SSH access to your server
- Root or sudo privileges

## Step 1: Initial Server Setup

### 1.1 Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2 Install Docker & Docker Compose
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add current user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose --version
```

### 1.3 Install Additional Tools
```bash
sudo apt install -y \
    git \
    curl \
    wget \
    certbot \
    python3-certbot-nginx
```

## Step 2: Clone and Setup Project

### 2.1 Clone Repository
```bash
cd /opt
sudo git clone https://github.com/yourusername/nexdefi-v7.git
cd nexdefi-v7
sudo chown -R $USER:$USER .
```

### 2.2 Configure Environment Variables
```bash
# Copy example configuration
cp .env.production.example .env.production

# Edit with your settings
nano .env.production
```

**Important environment variables to update:**
- `DB_USER` and `DB_PASSWORD`: Strong database credentials
- `REDIS_PASSWORD`: Strong Redis password
- `JWT_SECRET_KEY`: Generate with: `openssl rand -hex 32`
- `SENDGRID_API_KEY`: Your SendGrid API key
- `FROM_EMAIL`: Your sender email address
- `API_URL`: Your API domain (https://api.yourdomain.com)
- `FRONTEND_URL`: Your frontend domain (https://yourdomain.com)

### 2.3 Create Required Directories
```bash
mkdir -p ssl certbot/conf certbot/www backups
chmod 755 certbot/www
```

## Step 3: SSL Certificate Setup (Let's Encrypt)

### 3.1 Get SSL Certificate
```bash
# Replace yourdomain.com and www.yourdomain.com with your actual domain
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com \
  -d api.yourdomain.com \
  --agree-tos \
  -m your-email@example.com
```

### 3.2 Copy Certificates
```bash
# Certificates are at /etc/letsencrypt/live/yourdomain.com/
# The docker-compose file reads from ./certbot/conf which is a volume mount
```

### 3.3 Setup Auto-Renewal
```bash
# Create renewal script
sudo nano /etc/letsencrypt/renewal-hooks/post/docker-reload.sh

# Add this content:
#!/bin/bash
cd /opt/nexdefi-v7
docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload

# Make executable
sudo chmod +x /etc/letsencrypt/renewal-hooks/post/docker-reload.sh

# Test renewal
sudo certbot renew --dry-run
```

## Step 4: Update Application Configuration

### 4.1 Update Backend Requirements
Add to `backend/requirements.txt`:
```
gunicorn>=21.0.0
uvicorn[standard]>=0.24.0
```

### 4.2 Configure Nginx
Edit `nginx.conf` and replace:
- `yourdomain.com` with your actual domain (2 places)
- Update SSL certificate paths if needed

## Step 5: Deploy Application

### 5.1 Make Deploy Script Executable
```bash
chmod +x deploy.sh
```

### 5.2 Run Deployment
```bash
./deploy.sh
```

This script will:
- Stop existing containers
- Build new images
- Start all services
- Run database migrations
- Verify service health

### 5.3 Verify Deployment
```bash
# Check running containers
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f

# Test API
curl https://api.yourdomain.com/health
```

## Step 6: Database Setup

### 6.1 Connect to Database
```bash
# Get postgres container ID
docker compose -f docker-compose.prod.yml ps

# Access postgres shell
docker compose -f docker-compose.prod.yml exec postgres psql -U nexdefi_user -d nexdefi
```

### 6.2 Create Tables and Initial Data
If you have migration scripts, run:
```bash
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

## Step 7: Backup Strategy

### 7.1 Automated Database Backups
Create `/opt/backup-db.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/opt/nexdefi-v7/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

cd /opt/nexdefi-v7

docker compose -f docker-compose.prod.yml exec -T postgres pg_dump \
  -U $DB_USER $DB_NAME | gzip > $BACKUP_DIR/db_backup_$TIMESTAMP.sql.gz

# Keep only last 7 days of backups
find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +7 -delete
```

Setup cron job:
```bash
sudo crontab -e

# Add this line to backup daily at 2 AM
0 2 * * * /opt/backup-db.sh
```

## Step 8: Monitoring and Maintenance

### 8.1 Monitor Services
```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f

# Check specific service
docker compose -f docker-compose.prod.yml logs backend
```

### 8.2 Health Checks
```bash
# API health
curl https://api.yourdomain.com/health

# Frontend
curl -I https://yourdomain.com

# Database
docker compose -f docker-compose.prod.yml exec postgres pg_isready
```

### 8.3 Resource Monitoring
```bash
# CPU and Memory usage
docker stats

# Disk usage
df -h
```

## Step 9: Scaling and Performance

### 9.1 Increase Backend Workers
Edit `backend/Dockerfile.prod`:
```dockerfile
CMD ["gunicorn", "backend.main:app", "-w", "8", "-k", "uvicorn.workers.UvicornWorker", ...]
```

### 9.2 Redis Configuration
Add persistence to Redis in `docker-compose.prod.yml`:
```yaml
command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
```

### 9.3 Database Connection Pooling
Update `backend/config.py`:
```python
DATABASE_URL = "postgresql+asyncpg://user:pass@postgres/db?min_size=5&max_size=20"
```

## Troubleshooting

### Container fails to start
```bash
docker compose -f docker-compose.prod.yml logs backend
```

### Database connection issues
```bash
# Verify postgres is running
docker compose -f docker-compose.prod.yml ps postgres

# Test connection
docker compose -f docker-compose.prod.yml exec postgres pg_isready
```

### SSL certificate issues
```bash
# Check certificate status
sudo certbot certificates

# Renew certificate manually
sudo certbot renew --force-renewal
```

### Nginx not routing correctly
```bash
# Test nginx configuration
docker compose -f docker-compose.prod.yml exec nginx nginx -t

# Reload nginx
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

## Useful Commands

```bash
# Restart services
docker compose -f docker-compose.prod.yml restart

# Pull latest code and redeploy
git pull && ./deploy.sh

# View real-time logs
docker compose -f docker-compose.prod.yml logs -f --tail=100

# Execute command in container
docker compose -f docker-compose.prod.yml exec backend bash

# Down all services
docker compose -f docker-compose.prod.yml down

# Remove all volumes (WARNING: data loss!)
docker compose -f docker-compose.prod.yml down -v
```

## Security Checklist

- [ ] Update all passwords in .env.production to strong values
- [ ] Configure firewall (ufw or iptables)
- [ ] Set up SSH key authentication
- [ ] Disable root login via SSH
- [ ] Set up fail2ban for brute force protection
- [ ] Configure automated backups
- [ ] Set up monitoring/alerting
- [ ] Enable HTTPS (Let's Encrypt) ✓
- [ ] Configure CORS properly in backend
- [ ] Regular security updates: `sudo apt update && sudo apt upgrade`

## Performance Optimization

1. **Enable Gzip compression** - Already configured in nginx.conf
2. **Set up CDN** - Consider Cloudflare for static assets
3. **Database indexing** - Ensure proper indexes on frequently queried columns
4. **Redis caching** - Use for session and frequently accessed data
5. **Load balancing** - Deploy multiple instances behind nginx

## Support and Maintenance

- Monitor disk space: `df -h`
- Check system resources: `free -h` and `top`
- Review logs regularly: `/var/log/syslog`
- Keep Docker images updated: `docker image prune -a`

---

For more help, check Docker and Docker Compose documentation:
- Docker: https://docs.docker.com/
- Docker Compose: https://docs.docker.com/compose/
