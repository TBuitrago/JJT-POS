# Culto Orquideas POS

Sistema punto de venta (POS) para Culto Orquideas, tienda de plantas en Medellin, Colombia.

## Stack

- **Backend:** Node.js + Express + TypeScript
- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Base de datos:** Supabase (PostgreSQL + Auth)
- **Estado frontend:** Zustand (authStore, cartStore)
- **Email:** Nodemailer via Hostinger SMTP (puerto 465 SSL)
- **Deploy:** Hostinger Node.js (NO compila — solo ejecuta `node dist/index.js`)

## Estructura del proyecto

```
JJT-POS/
  backend/
    src/
      index.ts              # Entry point Express
      middleware/
        auth.ts             # JWT auth via Supabase
        authorize.ts        # requireAdmin middleware
      routes/
        auth.ts             # GET /api/auth/me
        products.ts         # CRUD /api/products
        orders.ts           # CRUD /api/orders + PATCH complete
        clients.ts          # CRUD /api/clients
        discountCodes.ts    # CRUD /api/discount-codes + validate
        inventoryLogs.ts    # GET /api/inventory-logs
        analytics.ts        # GET /api/analytics/*
      services/
        supabase.ts         # supabaseAdmin client (service_role_key)
        email.ts            # sendOrderConfirmation, sendRewardEmail
        rewards.ts          # checkAndEmitReward (loyalty program)
    dist/                   # Compiled JS (committed to repo)
    public/                 # Frontend build output (committed to repo)
  frontend/
    src/
      pages/                # LoginPage, DashboardPage, POSPage, OrdenesPage,
                            # ClientesPage, InventarioPage, DescuentosPage,
                            # HistorialPage, AnalisisPage, ForgotPasswordPage,
                            # ResetPasswordPage
      store/                # authStore.ts, cartStore.ts (Zustand)
      hooks/                # useAuth.ts, useRole.ts
  supabase/
    migrations/             # SQL migrations (apply manually in Supabase SQL Editor)
```

## Comandos

```bash
# Desarrollo
cd backend && npm run dev          # Backend con ts-node-dev (hot reload)
cd frontend && npm run dev         # Frontend con Vite (HMR)

# Build para produccion (ejecutar desde backend/)
npm run build:full                 # Compila frontend (Vite) + backend (tsc)

# Solo backend
npx tsc -b                        # Compilar TypeScript a dist/

# Solo frontend
cd frontend && npm run build       # tsc -b && vite build
```

## Autorizacion (RBAC)

Dos roles: `admin` (acceso completo) y `vendedor` (restringido).

- Roles asignados manualmente en tabla `user_profiles` de Supabase
- Backend: `requireAdmin` middleware + ownership checks (`created_by`)
- Frontend: hooks `useIsAdmin()` y `useCanEdit(createdBy)`

## Programa de recompensas

Al acumular $500.000 COP en ordenes completadas, el sistema genera automaticamente un codigo de descuento personal:

- Formato: `ORQ-XXXXXX` (20%, un solo uso, 30 dias de vigencia)
- Email automatico al cliente con codigo y condiciones
- Validacion en POS: verifica expiracion, uso, y propiedad del cliente
- Idempotencia: indice unico parcial previene duplicados
- Consumo atomico: UPDATE con filtros WHERE para concurrencia segura

**Nota:** Eliminar una orden NO revoca codigos de recompensa ya emitidos.

## Notas tecnicas

- **FK disambiguation:** Las queries entre `orders` y `discount_codes` DEBEN usar `!discount_code_id` en el embed de Supabase (ej: `discount_code:discount_codes!discount_code_id(...)`) para evitar ambiguedad con la FK reversa `redeemed_in_order_id`.
- **Migraciones:** Se aplican manualmente en el SQL Editor de Supabase (no hay CLI de migraciones).
- **dist/ y public/:** Se commitean al repo. Hostinger no compila, solo ejecuta.
- **Rate limiting:** 200 req / 15 min por IP en `/api`.
