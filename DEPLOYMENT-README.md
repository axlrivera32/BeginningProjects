# NexDeFi Production Deployment

This directory contains all the configuration and scripts needed to deploy NexDeFi to a production server.

## 📁 Structure

```
nexdefi-v7/
├── docker-compose.prod.yml      # Production Docker Compose configuration
├── nginx.conf                    # Nginx reverse proxy configuration
├── backend/
│   ├── Dockerfile.prod          # Production backend image
│   └── Dockerfile.prod          # Production Python build
├── frontend/
│   └── Dockerfile.prod          # Production frontend image
├── deploy.sh                     # Linux/Mac deployment script
├── deploy.ps1                    # Windows PowerShell deployment script
├── .env.production.example       # Environment variables template
├── SERVER-SETUP.md              # Comprehensive server setup guide
├── DEPLOYMENT-CHECKLIST.md      # Pre-deployment checklist
└── .github/workflows/deploy.yml # GitHub Actions CI/CD
```

## 🚀 Quick Start (Traditional Deployment)

### Prerequisites
- Linux server (Ubuntu 20.04+ recommended)
- Domain name
- Domain DNS pointing to server IP
- SSH access

### Deploy in 3 Commands

```bash
# 1. SSH into your server
ssh user@yourdomain.com

# 2. Clone and setup
cd /opt
git clone https://github.com/yourusername/nexdefi-v7.git
cd nexdefi-v7

# 3. Configure and deploy
cp .env.production.example .env.production
nano .env.production  # Update with your values
./deploy.sh           # Run deployment
```

That's it! Your app will be live at `https://yourdomain.com`

## 📋 What You Need Before Deploying

1. **Domain Name** - Where your app will be accessible
2. **Server** - Minimum 2GB RAM, 20GB storage (DigitalOcean, Linode, AWS, etc.)
3. **Email Service** - SendGrid API key for transactional emails
4. **Strong Passwords** - For database and Redis

## 🔧 Configuration

### Environment Variables

Edit `.env.production`:

```bash
# Critical - Change these!
DB_PASSWORD=your_secure_database_password_here
REDIS_PASSWORD=your_secure_redis_password_here
JWT_SECRET_KEY=your_random_secure_key_at_least_32_chars
API_URL=https://api.yourdomain.com
FRONTEND_URL=https://yourdomain.com

# Email
SENDGRID_API_KEY=your_sendgrid_api_key
FROM_EMAIL=noreply@yourdomain.com

# Optional
SENTRY_DSN=your_sentry_dsn_for_error_tracking
```

### SSL/HTTPS Certificate

Automatically handled by Let's Encrypt during deployment:
```bash
# Run before deploy.sh
mkdir -p ssl certbot/conf certbot/www

# Get certificate
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com \
  -d api.yourdomain.com \
  --agree-tos \
  -m your-email@example.com
```

## 📊 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Internet                           │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
            ┌──────────────────────────┐
            │    Nginx Reverse Proxy   │
            │  (Port 80 & 443 / SSL)   │
            └────────────┬─────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   ┌─────────────┐ ┌──────────────┐ ┌────────────┐
   │  Frontend   │ │   Backend    │ │  Database  │
   │ (React/Vue) │ │  (FastAPI)   │ │(PostgreSQL)│
   │ Port 3000   │ │  Port 8000   │ │ Port 5432  │
   └─────────────┘ └──────────────┘ └────────────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
                    ┌────▼────────┐
                    │    Redis    │
                    │ Port 6379   │
                    └─────────────┘
```

## 🔐 Security Features

- ✅ HTTPS/SSL with auto-renewal via Let's Encrypt
- ✅ Nginx rate limiting protection
- ✅ Security headers (HSTS, X-Content-Type-Options, etc.)
- ✅ Docker container isolation
- ✅ Redis password protection
- ✅ Database connection encryption
- ✅ JWT token authentication
- ✅ CORS configuration
- ✅ Gzip compression enabled

## 📈 Performance Features

- ✅ Nginx reverse proxy caching
- ✅ Gzip compression for all responses
- ✅ Multi-worker Gunicorn backend
- ✅ Redis session caching
- ✅ Docker image optimization
- ✅ Production database driver (asyncpg)

## 🛠️ Common Operations

### View Logs
```bash
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs backend
```

### Restart Services
```bash
docker compose -f docker-compose.prod.yml restart
```

### Backup Database
```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump \
  -U nexdefi_user nexdefi | gzip > backup.sql.gz
```

### Restore Database
```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U nexdefi_user nexdefi < backup.sql
```

### Update Application
```bash
git pull
./deploy.sh
```

### Access Backend Shell
```bash
docker compose -f docker-compose.prod.yml exec backend bash
```

### Execute Database Query
```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U nexdefi_user -d nexdefi -c "SELECT * FROM users;"
```

## 🚨 Troubleshooting

### Services won't start
```bash
# Check logs
docker compose -f docker-compose.prod.yml logs

# Rebuild images
docker compose -f docker-compose.prod.yml build --no-cache
```

### Database connection failed
```bash
# Verify database is running
docker compose -f docker-compose.prod.yml ps postgres

# Test connection
docker compose -f docker-compose.prod.yml exec postgres pg_isready
```

### SSL certificate issues
```bash
# Check certificate
sudo certbot certificates

# Renew manually
sudo certbot renew --force-renewal
```

### Out of disk space
```bash
# Check usage
df -h

# Clean Docker
docker system prune -a
```

## 📚 Full Documentation

- **[SERVER-SETUP.md](SERVER-SETUP.md)** - Complete step-by-step server setup guide
- **[DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md)** - Pre-deployment verification checklist

## 🤖 Automated Deployment (GitHub Actions)

For automatic deployment on every push to `main`:

1. Add secrets to your GitHub repository:
   - `DEPLOY_HOST` - Your server IP or domain
   - `DEPLOY_USER` - SSH username (usually `root` or `ubuntu`)
   - `DEPLOY_SSH_KEY` - Private SSH key for server access

2. The workflow in `.github/workflows/deploy.yml` will automatically:
   - Pull latest code
   - Build Docker images
   - Deploy to production
   - Run migrations
   - Notify on Slack (optional)

## 📞 Support

### Common Issues
- **Port already in use**: `docker compose -f docker-compose.prod.yml restart`
- **Out of memory**: Increase swap or reduce worker count
- **Database too large**: Implement data archival or upgrade storage

### Getting Help
1. Check logs: `docker compose -f docker-compose.prod.yml logs`
2. Review [SERVER-SETUP.md](SERVER-SETUP.md)
3. Check Docker documentation: https://docs.docker.com/
4. Ask in issues or discussions

## 📝 Environment Checklist

Before running `./deploy.sh`:

- [ ] `.env.production` file exists and is configured
- [ ] All required environment variables are set
- [ ] SSL certificates are in place
- [ ] Domain DNS is pointing to server
- [ ] Firewall allows ports 80, 443, 22
- [ ] Docker and Docker Compose are installed
- [ ] Server has at least 2GB RAM available

## 🔄 CI/CD Pipeline

The included GitHub Actions workflow enables:
- ✅ Automatic testing on pull requests
- ✅ Automatic deployment on push to main
- ✅ Slack notifications
- ✅ Rollback capability on failed deployments

## 📊 Monitoring

Monitor your production environment:

```bash
# Real-time stats
docker stats

# View logs with follow
docker compose -f docker-compose.prod.yml logs -f --tail=100

# Check service health
curl https://yourdomain.com/health
curl https://api.yourdomain.com/health
```

## 💾 Backups

Automated daily backups at 2 AM:
```bash
# View backups
ls -lh backups/

# Manual backup
docker compose -f docker-compose.prod.yml exec postgres pg_dump \
  -U $DB_USER $DB_NAME | gzip > backups/manual_$(date +%s).sql.gz
```

## 🎯 Next Steps

1. **[Read SERVER-SETUP.md](SERVER-SETUP.md)** for detailed setup instructions
2. **[Use DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md)** to verify everything is ready
3. **Run `./deploy.sh`** to deploy your application
4. **Monitor logs** to ensure everything is running smoothly
5. **Setup backups** for data protection

---

**Version**: 1.0.0  
**Last Updated**: March 2026  
**Status**: Production Ready ✅

For questions or issues, please refer to the [SERVER-SETUP.md](SERVER-SETUP.md) troubleshooting section.
