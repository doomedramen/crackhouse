# Deployment Guide

## Prerequisites

- Docker and Docker Compose
- 4GB+ RAM (8GB recommended)
- 20GB+ disk space
- Domain with SSL certificate

## Quick Deploy

1. Pull the repository

```bash
git clone https://github.com/doomedramen/crackhouse.git
cd crackhouse
```

2. Configure environment

```bash
cp .env.example .env
nano .env  # Edit with your values
```

3. Start services

```bash
docker compose up -d
```

4. Run migrations

```bash
docker exec -it crackhouse-api pnpm db:push
```

Access at your configured domain.

## Environment Variables

### Required

```bash
# Database
DATABASE_URL=postgresql://user:password@db:5432/crackhouse

# Redis
REDIS_URL=redis://redis:6379

# Security (generate strong random values)
AUTH_SECRET=your-32-char-secret-here
JWT_SECRET=your-32-char-secret-here

# Application
API_URL=https://api.yourdomain.com
FRONTEND_URL=https://yourdomain.com
```

### Optional

```bash
# File limits
MAX_PCAP_SIZE=524288000         # 500MB
MAX_DICTIONARY_SIZE=10737418240 # 10GB

# Hashcat
HASHCAT_MAX_CONCURRENT_JOBS=2

# Logging
LOG_LEVEL=info
```

## Docker Compose

The included `docker compose.yml` uses pre-built images from ghcr.io:

```yaml
services:
  db:
    image: postgres:16-alpine

  redis:
    image: redis:7-alpine

  api:
    image: ghcr.io/doomedramen/crackhouse/api:latest

  web:
    image: ghcr.io/doomedramen/crackhouse/web:latest
```

## Reverse Proxy (nginx)

Example nginx configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## SSL with Let's Encrypt

```bash
# Install certbot
sudo apt-get install certbot

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 3 * * * certbot renew --quiet && systemctl reload nginx
```

## Backups

### Database Backup

```bash
docker exec crackhouse-db pg_dump -U postgres crackhouse | gzip > backup.sql.gz
```

### Restore

```bash
gunzip -c backup.sql.gz | docker exec -i crackhouse-db psql -U postgres crackhouse
```

## Monitoring

### Health Check

```bash
curl https://yourdomain.com/api/health
```

### Logs

```bash
docker compose logs -f api
docker compose logs -f web
```

### Resource Usage

```bash
docker stats crackhouse-api crackhouse-web
```

## Updates

```bash
# Pull latest images
docker compose pull

# Recreate containers
docker compose up -d

# Run migrations if needed
docker exec -it crackhouse-api pnpm db:push
```

## Security

- Use strong secrets for AUTH_SECRET and JWT_SECRET
- Enable HTTPS with valid SSL certificate
- Set up firewall (allow only 22, 80, 443)
- Regular backups
- Keep dependencies updated
- Monitor logs for suspicious activity

## Legal

This tool is for authorized security testing only. Unauthorized access to networks is illegal. Ensure you have proper authorization before use.
