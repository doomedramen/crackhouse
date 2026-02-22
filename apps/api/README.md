# CrackHouse API

A comprehensive backend API for WiFi penetration testing tools, built with Hono, Better-Auth, Drizzle ORM, and BullMQ.

## Features

- **Authentication**: Complete auth system with Better-Auth
- **File Management**: PCAP and dictionary file uploads with Uppy integration
- **Background Processing**: BullMQ-powered job queues for resource-intensive tasks
- **WiFi Network Analysis**: PCAP processing and network extraction
- **Password Cracking**: Hashcat integration for WPA/WPA2 attacks
- **Dictionary Generation**: Custom password list creation with transformation rules
- **Database Management**: PostgreSQL with Drizzle ORM migrations
- **API Documentation**: RESTful endpoints with validation

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Hono (fast web framework)
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Better-Auth
- **Queue System**: BullMQ with Redis
- **File Uploads**: Uppy-compatible endpoints
- **Validation**: Zod schemas
- **Development**: TSX for TypeScript execution

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- pnpm package manager

## Quick Start

1. **Install dependencies**:

   ```bash
   pnpm install
   ```

2. **Set up environment variables**:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Set up database**:

   ```bash
   pnpm db:push  # Push schema to database
   # Or run migrations:
   pnpm db:migrate
   ```

4. **Start Redis server**:

   ```bash
   # Using Docker:
   docker run -d -p 6379:6379 redis:alpine

   # Or install Redis locally
   ```

5. **Start the development server**:
   ```bash
   pnpm dev
   ```

The API will be available at `http://localhost:3001`

## API Endpoints

### Authentication

- `POST /auth/sign-up` - Create new account
- `POST /auth/sign-in` - Sign in to existing account
- `POST /auth/sign-out` - Sign out
- `GET /auth/me` - Get current user profile
- `GET /auth/sessions` - Get active sessions

### Networks

- `GET /api/networks` - List all networks
- `GET /api/networks/:id` - Get specific network
- `POST /api/networks` - Create new network
- `PUT /api/networks/:id` - Update network
- `DELETE /api/networks/:id` - Delete network

### Dictionaries

- `GET /api/dictionaries` - List all dictionaries
- `GET /api/dictionaries/:id` - Get specific dictionary
- `POST /api/dictionaries` - Create dictionary

### Jobs & Queue Management

- `GET /api/jobs` - List all jobs
- `GET /api/jobs/:id` - Get specific job
- `POST /api/queue/crack` - Start password cracking job
- `POST /api/queue/dictionary/generate` - Generate custom dictionary
- `GET /api/queue/stats` - Get queue statistics
- `DELETE /api/queue/jobs/:id` - Cancel job
- `POST /api/queue/jobs/:id/retry` - Retry failed job
- `POST /api/queue/cleanup` - Start cleanup job

### File Uploads (Uppy Compatible)

- `POST /api/upload` - Traditional multipart upload
- `POST /api/upload/presign` - Get presigned upload URL
- `PUT /api/upload/presigned/:uploadId` - Direct file upload
- `POST /api/upload/complete` - Complete upload process
- `GET /api/upload/status/:uploadId` - Get upload status
- `DELETE /api/upload/:uploadId` - Delete uploaded file
- `GET /api/upload/config` - Get upload configuration

### System

- `GET /health` - Health check with queue status

## Environment Variables

### Required

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `AUTH_SECRET` - Secret for authentication (32+ chars)
- `JWT_SECRET` - Secret for JWT tokens (32+ chars)

### Optional

- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3001)
- `UPLOAD_DIR` - File upload directory (default: ./uploads)
- `MAX_FILE_SIZE` - Maximum file size (default: 100MB)
- `FRONTEND_URL` - Frontend application URL
- `CORS_ORIGIN` - CORS allowed origins

## Background Jobs

The API uses BullMQ for background processing:

### Queue Types

1. **PCAP Processing** - Extract WiFi networks from PCAP files
2. **Hashcat Cracking** - Run password cracking attacks
3. **Dictionary Generation** - Create custom password lists
4. **File Cleanup** - Clean up temporary and old files

### Worker Management

```bash
# Start workers (in production)
pnpm worker

# Check queue health
pnpm queue:stats

# Check worker health
pnpm worker:health
```

## Database Schema

The application uses the following main tables:

- `users` - User accounts and authentication
- `sessions` - User sessions
- `accounts` - OAuth accounts
- `networks` - WiFi network information
- `dictionaries` - Password dictionaries
- `jobs` - Background job tracking
- `job_results` - Cracking results
- `verifications` - Email verification tokens

## Database Migrations

```bash
# Generate new migration
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Push schema changes (development)
pnpm db:push

# Open database studio
pnpm db:studio
```

## File Upload Integration

The API supports both traditional multipart uploads and Uppy-compatible resumable uploads:

### Traditional Upload

```javascript
const formData = new FormData();
formData.append("file", file);
formData.append("type", "pcap");

fetch("/api/upload?type=pcap", {
  method: "POST",
  body: formData,
});
```

### Uppy Integration

```javascript
// Get presigned URL
const response = await fetch("/api/upload/presign", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    filename: "capture.pcap",
    type: "pcap",
  }),
});

// Upload file directly
const { uploadUrl } = await response.json();
fetch(uploadUrl, {
  method: "PUT",
  body: file,
  headers: {
    "Content-Type": "application/octet-stream",
    "x-upload-filename": "capture.pcap",
    "x-upload-type": "pcap",
  },
});
```

## Development

### Scripts

- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm worker` - Start background workers
- `pnpm db:studio` - Open database management interface

### Project Structure

```
src/
├── config/          # Configuration and environment
├── db/              # Database schema and migrations
├── lib/             # Utility libraries (auth, queue)
├── routes/          # API route handlers
├── workers/         # Background job processors
└── index.ts         # Main server entry point
```

## Security Notes

- All file uploads are validated for type and size
- Authentication is required for sensitive operations
- Jobs are isolated and have timeout protections
- Rate limiting is configurable
- CORS is properly configured for frontend access

## Production Deployment

1. Set production environment variables
2. Ensure PostgreSQL and Redis are secured
3. Set up proper file storage (S3 recommended for production)
4. Configure reverse proxy (nginx/caddy)
5. Set up monitoring and logging
6. Run database migrations
7. Start both the API server and workers

## License

This software is designed for authorized security testing and educational purposes only.
