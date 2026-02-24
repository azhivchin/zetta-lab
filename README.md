# Zetta Lab

Cloud-based management platform built for dental laboratories. Handles everything from order tracking and production workflows to financials, warehouse, and HR — all in one place.

Built as a multi-tenant SaaS, so multiple labs can run independently on the same instance.

## What it does

**Orders & Production** — Full order lifecycle with a Kanban board, production stages, deadline tracking, and automatic status history. Technicians see their assignments, managers see the big picture.

**Financials** — Invoices, payment tracking, expense management, P&L reports. Generates PDF documents (invoices, acts, TORG-12) with proper Cyrillic support. Budget planning with income vs. expense breakdowns.

**Warehouse** — Material inventory with consumption norms per work type. Auto write-off when an order is delivered. Low stock alerts.

**HR** — Employee profiles, salary calculation (fixed + per-unit), vacation tracking, contract management. Birthday reminders for the team.

**Analytics** — Revenue charts, technician performance stats, client activity, deadline predictions using linear regression. Everything exports to Excel or PDF.

**Quality Control** — Rework tracking with reason codes, subcontractor management for outsourced work.

**Dynamic References** — Configurable catalogs (work types, materials, price lists) that each organization can customize without touching code.

## Tech stack

**Backend:** Fastify 5, TypeScript, Prisma 6.19 (32 models), PostgreSQL 16, Redis 7

**Frontend:** Next.js 14, React 18, Tailwind CSS, Recharts 3.7, TypeScript

**Infrastructure:** Docker Compose, PM2, Caddy (reverse proxy + SSL)

The backend exposes 174+ REST endpoints across 21 modules. Auth uses JWT with refresh token rotation (15 min access / 30 day refresh). Redis handles caching for dashboard and kanban views.

## Project structure

```
├── backend/
│   ├── src/
│   │   ├── server.ts              # Fastify entry point
│   │   ├── middleware/auth.ts     # JWT + role-based access
│   │   ├── lib/                   # Prisma, Redis, error handling
│   │   └── modules/               # 21 API modules
│   │       ├── auth/
│   │       ├── orders/
│   │       ├── clients/
│   │       ├── warehouse/
│   │       ├── finance/
│   │       ├── analytics/
│   │       └── ...
│   └── prisma/
│       └── schema.prisma          # 32 models, 13 enums
│
├── frontend/
│   ├── src/
│   │   ├── app/                   # 22 Next.js routes
│   │   ├── components/            # Shared UI components
│   │   └── lib/                   # API client, exports, hooks
│   └── public/fonts/              # PTSans for PDF generation
│
└── docker-compose.yml             # PostgreSQL + Redis
```

## Running locally

You'll need Node.js 20+, Docker, and npm.

```bash
# Start databases
docker-compose up -d

# Backend
cd backend
cp .env.example .env
# Fill in your database and Redis credentials
npm install
npx prisma generate
npx prisma db push
npx tsx src/seed.ts    # seed initial data
npm run dev

# Frontend (in another terminal)
cd frontend
cp .env.example .env
npm install
npm run dev
```

Backend runs on `http://localhost:4500`, frontend on `http://localhost:3000`.

## Role system

Six roles with different access levels: Owner, Admin, Manager, Technician, Accountant, Viewer. Each role sees only the pages and actions relevant to their position. Owner has full access including organization settings and user management.

## Notable implementation details

**Cascading price resolution** — prices resolve through a chain: manual override > client-specific price > price list item > base price. This gives labs flexibility in pricing without duplicating data.

**Auto-refresh auth** — when a 401 hits, the frontend silently refreshes the JWT using the refresh token and retries the original request. Users don't see interruptions.

**Soft deletes** — clients, work types, and materials aren't actually deleted. They're marked `isActive: false` so historical orders still reference them correctly.

**PDF generation** — server-side PDF creation with embedded Cyrillic fonts (PTSans). Invoices, acts, and shipping documents match the legally required Russian formats.

## License

MIT
