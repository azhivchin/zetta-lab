# Zetta Lab

Cloud management platform for dental laboratories. Covers the full workflow: orders, production tracking, finances, warehouse, HR, and analytics. Multi-tenant, so multiple labs can run on one instance without interfering with each other.

## What it does

**Orders & Production.** Create work orders, assign technicians, track production stages on a Kanban board. Deadlines, status history, and stage assignments are all built in.

**Financials.** Invoices, payment tracking, expense management, P&L reports. PDF documents (invoices, acts, TORG-12) are generated server-side with Cyrillic font support. Budget planning included.

**Warehouse.** Material inventory with consumption norms per work type. When an order ships, materials are written off automatically. Low stock alerts notify the team.

**HR.** Employee profiles, salary calculations (fixed rate or per-unit), vacation tracking, contract management. Even tracks birthdays.

**Analytics.** Revenue charts, technician performance, client activity, deadline predictions via linear regression. Export everything to Excel or PDF.

**Quality Control.** Rework tracking with reason codes. Subcontractor management for outsourced jobs.

**Dynamic References.** Configurable catalogs (work types, materials, price lists) that each lab can customize without code changes.

## Tech stack

**Backend:** Fastify 5, TypeScript, Prisma 6 (32 models), PostgreSQL 16, Redis 7

**Frontend:** Next.js 14, React 18, Tailwind CSS, Recharts, TypeScript

**Infrastructure:** Docker Compose, PM2, Caddy (reverse proxy + auto SSL)

174+ REST endpoints across 21 modules. Auth is JWT-based with refresh token rotation (15 min access / 30 day refresh). Redis handles dashboard and kanban caching.

## Project structure

```
backend/
  src/
    server.ts               # Fastify entry point
    middleware/auth.ts       # JWT + role-based access
    lib/                     # Prisma, Redis, error handling
    modules/                 # 21 API modules
      auth/
      orders/
      clients/
      warehouse/
      finance/
      analytics/
      ...
  prisma/
    schema.prisma            # 32 models, 13 enums

frontend/
  src/
    app/                     # 22 Next.js routes
    components/              # Shared UI components
    lib/                     # API client, exports, hooks
  public/fonts/              # PTSans for PDF generation

docker-compose.yml           # PostgreSQL + Redis + Nginx
```

## Running locally

Requires Node.js 20+, Docker, and npm.

```bash
# Start databases
docker-compose up -d

# Backend
cd backend
cp .env.example .env        # then fill in your credentials
npm install
npx prisma generate
npx prisma db push
npx tsx src/seed.ts          # seed initial data
npm run dev

# Frontend (separate terminal)
cd frontend
cp .env.example .env
npm install
npm run dev
```

Backend starts on `http://localhost:4500`, frontend on `http://localhost:3000`.

## Roles

Six roles with different access levels: Owner, Admin, Manager, Technician, Accountant, Viewer. Each role only sees pages and actions relevant to their position. Owner gets full access including org settings and user management.

## Implementation notes

**Cascading price resolution.** Prices resolve through a chain: manual override > client-specific price > price list item > base price. Gives labs pricing flexibility without duplicating data.

**Auto-refresh auth.** When a 401 comes back, the frontend silently refreshes the JWT using the stored refresh token and retries the request. No interruption for the user.

**Soft deletes.** Clients, work types, and materials are marked `isActive: false` instead of being removed. Historical orders keep referencing them correctly.

**PDF generation.** Server-side PDF creation with embedded Cyrillic fonts (PTSans). Invoices, acts, and shipping documents follow legally required Russian formats.

## License

MIT
