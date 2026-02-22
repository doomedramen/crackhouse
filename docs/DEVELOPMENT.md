# Development Guide

## Prerequisites

- Node.js 22+
- pnpm
- Docker and Docker Compose
- Git

## Setup

1. Clone the repository

```bash
git clone https://github.com/doomedramen/crackhouse.git
cd crackhouse
```

2. Install dependencies

```bash
pnpm install
```

3. Start services

```bash
docker compose up -d
```

4. Run database migrations

```bash
cd apps/api
pnpm db:push
```

5. Start development servers

```bash
# Terminal 1 - API
cd apps/api && pnpm dev

# Terminal 2 - Web
cd apps/web && pnpm dev

# Terminal 3 - Worker
cd apps/api && pnpm worker
```

Access the application at http://localhost:3000

## Project Structure

```
crackhouse/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/       # API endpoints
│   │   │   ├── workers/      # Background jobs
│   │   │   ├── db/           # Database schema & migrations
│   │   │   └── lib/          # Utilities
│   │   └── __tests__/        # API tests
│   └── web/
│       ├── app/              # Next.js app router
│       ├── components/       # React components
│       └── tests/            # E2E tests
├── packages/
│   ├── ui/                   # Shared UI components
│   ├── typescript-config/
│   └── eslint-config/
└── docs/
```

## Tech Stack

**Frontend**

- Next.js 16 (App Router)
- React 19
- Tailwind CSS
- shadcn/ui components
- TanStack Query
- React Hook Form + Zod

**Backend**

- Hono (HTTP framework)
- PostgreSQL 16
- Drizzle ORM
- Redis + BullMQ
- Better Auth
- Hashcat integration

## Development Workflow

### Making Changes

1. Create a branch

```bash
git checkout -b feature/your-feature-name
```

2. Make your changes

3. Run tests and checks

```bash
pnpm lint
pnpm typecheck
pnpm test
```

4. Commit following conventional commits

```bash
git commit -m "feat: add new feature"
git commit -m "fix: resolve bug"
```

5. Push and create PR

```bash
git push origin feature/your-feature-name
```

## Testing

### API Tests

```bash
cd apps/api
pnpm test              # Run with watch
pnpm test:run          # Run once
pnpm test:coverage     # Coverage report
```

### E2E Tests

```bash
# From repo root
pnpm test:e2e          # Run E2E tests in Docker
```

See [testing/README.md](../testing/README.md) for more details.

## Code Standards

- Use TypeScript strict mode
- Follow ESLint rules
- Write tests for new features
- Use functional React components
- Prefer Server Components in Next.js
- Use Zod for validation

## Database

### Migrations

```bash
cd apps/api
pnpm db:generate       # Generate migration
pnpm db:push           # Apply schema changes
```

### Reset database

```bash
docker compose down -v
docker compose up -d
pnpm db:push
```

## Troubleshooting

### Port conflicts

```bash
lsof -i :3000
kill -9 <PID>
```

### Clear caches

```bash
rm -rf node_modules .next dist
pnpm install
```

### Database issues

```bash
docker compose restart db
pnpm db:push
```

## Resources

- [Next.js Docs](https://nextjs.org/docs)
- [Drizzle ORM Docs](https://orm.drizzle.team)
- [Hono Docs](https://hono.dev)
