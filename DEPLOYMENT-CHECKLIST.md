# Quick Deployment Checklist

## Pre-Deployment (Local)

- [ ] Update `backend/requirements.txt` with production dependencies (gunicorn added)
- [ ] Configure `backend/config.py` for production environment
- [ ] Build and test Docker images locally
- [ ] Update `frontend/package.json` build scripts
- [ ] Test frontend build: `npm run build`

## Server Setup (Initial)

- [ ] Rent/provision Linux server (Ubuntu 20.04+, 2GB+ RAM, 20GB+ storage)
- [ ] Configure DNS to point domain to server IP
- [ ] SSH into server
- [ ] Run: `curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh`
- [ ] Verify Docker: `docker --version && docker compose --version`
- [ ] Create `/opt/nexdefi-v7` directory
- [ ] Clone project: `git clone <repo> /opt/nexdefi-v7`

## Configuration

- [ ] Copy: `cp .env.production.example .env.production`
- [ ] Edit `.env.production` with actual values:
  - [ ] Strong `DB_PASSWORD`
  - [ ] Strong `REDIS_PASSWORD`
  - [ ] Generate `JWT_SECRET_KEY`: `openssl rand -hex 32`
  - [ ] Set `API_URL` = `https://api.yourdomain.com`
  - [ ] Set `FRONTEND_URL` = `https://yourdomain.com`
  - [ ] Set `SENDGRID_API_KEY`
  - [ ] Set `FROM_EMAIL`

- [ ] Update `nginx.conf`:
  - [ ] Replace `yourdomain.com` with actual domain (2 occurrences)
  - [ ] Update SSL certificate paths if needed

## SSL Setup

- [ ] Install Certbot: `sudo apt install certbot`
- [ ] Create directories: `mkdir -p ssl certbot/conf certbot/www`
- [ ] Get certificate:
  ```bash
  sudo certbot certonly --standalone \
    -d yourdomain.com \
    -d www.yourdomain.com \
    -d api.yourdomain.com \
    --agree-tos \
    -m your-email@example.com
  ```
- [ ] Verify certificates in `/etc/letsencrypt/live/yourdomain.com/`

## Deployment

- [ ] Make scripts executable: `chmod +x deploy.sh`
- [ ] Run deployment: `./deploy.sh`
- [ ] Wait for containers to start (~30 seconds)
- [ ] Verify health:
  ```bash
  curl https://yourdomain.com
  curl https://api.yourdomain.com/health
  ```

## Post-Deployment

- [ ] Check logs: `docker compose -f docker-compose.prod.yml logs`
- [ ] Database initialized: `docker compose -f docker-compose.prod.yml exec postgres psql -U $DB_USER -d $DB_NAME -c '\dt'`
- [ ] Test API endpoints
- [ ] Test frontend routing
- [ ] Verify SSL certificate (should show 🔒)

## Backups & Monitoring

- [ ] Setup automated backups: Create `backup-db.sh` and add to crontab
- [ ] Setup monitoring (optional): NewRelic, DataDog, or similar
- [ ] Setup alerting for disk space, CPU, memory
- [ ] Regular log rotation

## Security Verification

- [ ] Firewall configured (only ports 80, 443, 22 open)
- [ ] SSH key authentication enabled
- [ ] Root login disabled
- [ ] Passwords are strong (20+ characters)
- [ ] SSL certificate valid and auto-renewal configured
- [ ] CORS configured properly in backend
- [ ] Rate limiting enabled in nginx

## Ongoing Maintenance

- [ ] Monthly: Check for updates `sudo apt update && sudo apt upgrade`
- [ ] Monthly: Review logs for errors
- [ ] Quarterly: Test backup restoration
- [ ] Quarterly: Review and update security settings
- [ ] As-needed: Monitor disk space and scale resources

## Troubleshooting

If deployment fails:
1. Check logs: `docker compose -f docker-compose.prod.yml logs -f`
2. Verify environment variables: `cat .env.production`
3. Test connectivity: `docker compose -f docker-compose.prod.yml exec postgres pg_isready`
4. Restart services: `docker compose -f docker-compose.prod.yml restart`

## Cleanup (if needed)

```bash
# Restart all services
docker compose -f docker-compose.prod.yml restart

# View real-time logs
docker compose -f docker-compose.prod.yml logs -f

# Stop all services (keeps data)
docker compose -f docker-compose.prod.yml down

# Reset everything (WARNING: deletes data!)
docker compose -f docker-compose.prod.yml down -v
rm -rf postgres_data redis_data
```

## Support Contacts

- Docker Issues: https://docs.docker.com/
- SSL Issues: https://certbot.eff.org/docs/
- Server Issues: Your hosting provider support

---

**Last Updated**: March 2026
**Status**: Ready for production
