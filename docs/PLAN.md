# Zetta Lab Roadmap

## Architecture overview

```
Organization (multi-tenancy root)
├── User (roles: owner, admin, senior_tech, technician, courier, accountant)
├── Client (dental clinics)
│   ├── Doctor
│   ├── ClientPriceList (per-client pricing)
│   └── ClientBalance
├── WorkCatalog (numbered categories 1.x.x - 6.x.x)
│   ├── WorkCategory
│   └── MaterialNorm (consumption rates)
├── Order (core entity)
│   ├── OrderItem (line items)
│   ├── OrderStage (production pipeline)
│   ├── OrderPhoto
│   ├── OrderComment
│   └── OrderHistory (audit trail)
├── Material
│   ├── MaterialMovement (in/out)
│   └── MaterialStock
├── Payment / Invoice / Act / Expense
├── SalaryRecord
├── CourierRoute
└── Notification
```

## Modules

| # | Module | What it covers |
|---|--------|---------------|
| 1 | Core | Multi-tenant auth, RBAC (8 roles), org settings |
| 2 | Directories | Work catalog, price lists, materials, color scales |
| 3 | CRM | Clinics, doctors, patients, order history, balances |
| 4 | Orders | Work orders, production stages, assignments, photos, comments |
| 5 | Production | Kanban board, technician workload, deadline tracking |
| 6 | Warehouse | Stock management, auto write-off, low stock alerts, inventory |
| 7 | Finance | Invoices, acts, payments, expenses, P&L |
| 8 | Salary | Per-unit and fixed rate calculations, payroll sheets |
| 9 | Logistics | Courier routes, pickup/delivery tracking |
| 10 | Reports | Client, technician, financial, warehouse reports. Excel/PDF export |
| 11 | Client Portal | Separate login for clinics, order placement, status tracking |
| 12 | Notifications | In-app, Telegram bot, email triggers |

## Development phases

### Phase 1: MVP (done)
Infrastructure, auth + RBAC, work catalog, client management, work orders with production stages, Kanban board, basic search and filtering, dashboard.

### Phase 2: Operations (done)
Warehouse and materials, salary calculations, finance (invoices, acts, payments), expenses and budgeting, courier logistics, photo attachments.

### Phase 3: Advanced (done)
Analytics and reporting, quality control, subcontractor management, dynamic reference catalogs, Excel/PDF exports, Telegram notifications.

### Phase 4: Scale (planned)
Client portal with separate login, subscription billing, onboarding flow, data import from Excel, help center.
