# ExpressVisa

Official e-visa processing landing page.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS** + **shadcn/ui**
- **Prisma** ORM
- **PostgreSQL** (via Docker)
- **pnpm**

## Getting started

### 1. Prerequisites

- [Node.js 20+](https://nodejs.org)
- [pnpm](https://pnpm.io) — `npm i -g pnpm`
- [Docker Desktop](https://www.docker.com/products/docker-desktop)

### 2. Install dependencies

```bash
pnpm install
```

### 3. Environment

```bash
cp .env.example .env
```

The defaults in `.env.example` match the Docker Compose config, so no edits are needed for local dev.

### 4. Start the database

```bash
docker compose up -d
```

### 5. Run migrations & seed

```bash
pnpm db:migrate      # deploy existing migrations
pnpm db:seed         # insert sample data
```

### 6. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts

| Command              | Description                                  |
|----------------------|----------------------------------------------|
| `pnpm dev`           | Start Next.js dev server                     |
| `pnpm build`         | Production build                             |
| `pnpm start`         | Start production server                      |
| `pnpm db:migrate`    | Deploy migrations (`prisma migrate deploy`)  |
| `pnpm db:migrate:new`| Create a new migration (`prisma migrate dev`)|
| `pnpm db:seed`       | Seed the database                            |
| `pnpm db:studio`     | Open Prisma Studio                           |
| `pnpm db:generate`   | Regenerate Prisma client                     |

---

## Project structure

```
expressvisa/
├── app/
│   ├── api/health/route.ts   # DB health check
│   ├── globals.css           # Tailwind + brand styles
│   ├── layout.tsx            # Root layout + fonts + metadata
│   └── page.tsx              # Landing page
├── components/
│   ├── ui/
│   │   ├── button.tsx        # shadcn Button
│   │   └── dialog.tsx        # shadcn Dialog
│   ├── Footer.tsx
│   ├── LegalModal.tsx
│   └── Nav.tsx
├── lib/
│   ├── prisma.ts             # Singleton Prisma client
│   └── utils.ts              # cn() helper
├── prisma/
│   ├── schema.prisma         # DB schema
│   └── seed.ts               # Seed script
├── .env.example
├── components.json           # shadcn/ui config
├── docker-compose.yml
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

## Health check

```
GET /api/health
→ { "status": "ok", "db": "connected" }
```
