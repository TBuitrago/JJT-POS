# 🌿 Culto Orquídeas — Sistema POS

Sistema de Punto de Venta e Inventario para **Culto Orquídeas**, empresa colombiana especializada en plantas exóticas (Medellín, Colombia).

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| UI Components | shadcn/ui + Lucide Icons |
| Estado | Zustand |
| Routing | React Router v7 |
| Backend | Node.js + Express + TypeScript |
| Base de datos | Supabase (PostgreSQL) |
| Autenticación | Supabase Auth (JWT) |
| Email | Nodemailer + Hostinger SMTP |
| Gráficas | Recharts |
| Selector de fechas | react-day-picker v8 + date-fns |
| Generación PDF | @react-pdf/renderer (client-side) |
| Seguridad API | Helmet.js + express-rate-limit |

---

## Estructura del monorepo

```
culto-orquideas-pos/
├── frontend/                  # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/        # Componentes reutilizables (Modal, Layout, Sidebar…)
│   │   ├── pages/             # Módulos del sistema (ver tabla abajo)
│   │   ├── hooks/             # Custom React hooks
│   │   ├── lib/               # api.ts (Axios + interceptor JWT), utils.ts
│   │   ├── store/             # Zustand (cartStore)
│   │   └── types/             # Tipos TypeScript globales
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
├── backend/                   # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── routes/            # Endpoints REST
│   │   ├── middleware/        # Auth JWT (authMiddleware)
│   │   ├── services/          # supabase.ts, email.ts
│   │   └── types/
│   ├── dist/                  # JS compilado (commiteado para Hostinger)
│   ├── public/                # Frontend build (commiteado para Hostinger)
│   ├── .env.example
│   └── package.json
├── supabase/
│   ├── migrations/            # Migraciones SQL (Supabase CLI)
│   └── config.toml
└── .gitignore
```

---

## Módulos del sistema

| Página | Ruta | Descripción |
|--------|------|-------------|
| Login | `/login` | Autenticación con Supabase Auth |
| Dashboard | `/` | KPIs, alertas de stock, gráfica 14 días, últimas órdenes |
| Inventario | `/inventario` | CRUD de productos, SKU auto-incremental, soft-delete |
| POS | `/pos` | Venta paso a paso: carrito → cliente → descuento → pago. Soporta modo edición de borradores (`?draft=UUID`) |
| Órdenes | `/ordenes` | Tabla paginada, filtros por estado, barra de búsqueda (cliente/email/nº orden, debounced). Detalle en modal, completar/eliminar. Botón ✏️ Editar en borradores. Botón ⬇ PDF en órdenes completadas |
| Clientes | `/clientes` | CRUD de clientes registrados |
| Descuentos | `/descuentos` | CRUD de códigos de descuento, toggle activo/inactivo |
| Historial | `/historial` | Logs de inventario paginados con filtros por acción |
| Análisis | `/analisis` | KPIs, gráficas de ventas, top productos, métodos de pago, descuentos. Selector de rango de fechas (presets 7/30/60/90d + calendario personalizado con botón "Aplicar"). Comparativo "Año anterior" / "Período anterior": delta % en KPIs, dos líneas en gráfica, columnas Comp./Δ% en tabla de descuentos |

---

## API — Rutas backend

```
GET    /api/health

# Productos
GET    /api/products
POST   /api/products                  # SKU auto-incremental
PUT    /api/products/:id
DELETE /api/products/:id              # Soft delete (is_active=false)

# Clientes
GET    /api/clients
GET    /api/clients/:id
POST   /api/clients
PUT    /api/clients/:id
DELETE /api/clients/:id

# Descuentos
GET    /api/discount-codes
GET    /api/discount-codes/validate?code=XXX
POST   /api/discount-codes
PUT    /api/discount-codes/:id
DELETE /api/discount-codes/:id

# Órdenes (paginadas + búsqueda)
GET    /api/orders?page=1&limit=20&status=draft|completed&search=texto
GET    /api/orders/:id
POST   /api/orders                    # Crea borrador o completa
PUT    /api/orders/:id                # Edita header + items de un borrador (sin deducir stock)
PATCH  /api/orders/:id/complete       # Completa → descuenta stock + envía email
DELETE /api/orders/:id                # Soft-delete (cualquier estado). Si completada → revierte stock

# Inventario logs
GET    /api/inventory-logs?page=1&limit=20&action=add|remove|create|delete

# Analítica
# Soporta ?from=YYYY-MM-DD&to=YYYY-MM-DD  (rango explícito)
# o      ?days=N                           (últimos N días)
# o      sin parámetros                    (all-time, usado por DashboardPage)
GET    /api/analytics/summary?from=&to=            # KPIs principales; productos paginados (supera límite 1000 rows)
GET    /api/analytics/sales-by-day?from=&to=       # ventas por día, pre-rellena todos los días del rango
GET    /api/analytics/top-products                 # top 10 productos (all-time)
GET    /api/analytics/payment-breakdown            # distribución efectivo/transferencia (all-time)
GET    /api/analytics/discounts?from=&to=          # total descuentos + desglose por código
```

---

## Reglas de negocio

- **Descuento**: aplica solo sobre subtotal de productos, **nunca** sobre el envío
- **Fórmula de total**: `(subtotal_bruto × (1 − descuento%)) + envío`
- **Monto de descuento**: `subtotal_gross − subtotal_net`
- **Ingresos Totales** (KPI): `subtotal_net` — excluye envíos. Los envíos se muestran como KPI independiente ("Ingresos por envíos")
- **Stock**: se descuenta únicamente al **completar** la orden (no en borrador)
- **Editar borrador**: `PUT /api/orders/:id` reemplaza los items (DELETE + INSERT) sin deducir stock. Al completar desde el POS en modo edición: primero `PUT` (actualiza), luego `PATCH /complete` (descuenta stock)
- **SKU**: 4 dígitos numéricos, auto-incremental (ej. `0001`, `0042`)
- **Número de orden**: formato `CO-XXXX` via sequence PostgreSQL (no se reinicia)
- **Eliminación de productos**: soft-delete (`is_active=false`), se conserva FK histórico
- **Eliminación de órdenes**: soft-delete (`deleted_at`). Si la orden estaba completada, el stock se revierte automáticamente y se registra en inventory_logs (`action=add`)
- **Órdenes eliminadas**: visibles en la tab "Eliminadas" de OrdenesPage; excluidas de todos los KPIs y gráficas de Análisis
- **Clientes visitantes**: la orden almacena `guest_name` en lugar de `client_id`
- **Teléfono cliente**: nullable — columna `clients.phone` permite `NULL` (migración `20260311000000`)
- **Ajuste de precio por ítem**: el admin puede cambiar el precio de venta al crear/editar una orden sin modificar el inventario. Se guarda en `original_price` y `price_note` en `order_items`. Visible en el modal de detalle, en el email y en el PDF
- **PDF de órdenes**: las órdenes completadas (visitantes y clientes registrados) se pueden descargar como `CO-XXXX.pdf` directamente desde el modal de detalle en OrdenesPage. Generación 100% client-side

---

## Colores de marca

| Token | Hex | Uso |
|-------|-----|-----|
| `brand-green` | `#00261B` | Fondo principal, cards |
| `brand-lime` | `#C7EA45` | Acento, botones primarios, SKU |
| `brand-black` | `#000000` | Fondo oscuro, sidebar |
| `brand-white` | `#FFFFFF` | Texto principal |

---

## Setup local

### Requisitos previos
- Node.js ≥ 18
- npm ≥ 9
- Cuenta Supabase con proyecto creado
- Cuenta Hostinger con SMTP habilitado

### 1. Clonar el repositorio

```bash
git clone https://github.com/TBuitrago/culto-orquideas-pos.git
cd culto-orquideas-pos
```

### 2. Configurar variables de entorno

```bash
cp backend/.env.example backend/.env
```

Editar `backend/.env` con los valores reales (ver sección Variables de entorno).

En `frontend/`, crear `.env.local`:
```
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
# VITE_API_URL — no configurar; el proxy de Vite redirige /api/* → :3001
```

### 3. Instalar dependencias

```bash
# Frontend
cd frontend && npm install

# Backend
cd ../backend && npm install
```

### 4. Aplicar migraciones

```bash
# Desde la raíz
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

### 5. Seed de prueba (desarrollo)

```bash
# Aplica 10 plantas de prueba (SKU 0001–0010)
npx supabase db execute --file supabase/seed.sql
```

### 6. Levantar servidores

```bash
# Terminal 1 — Backend
cd backend && npm run dev
# → http://localhost:3001

# Terminal 2 — Frontend
cd frontend && npm run dev
# → http://localhost:5173
```

### Verificación rápida

```bash
curl http://localhost:3001/api/health
# {"status":"ok"}
```

---

## Variables de entorno — Backend (`backend/.env`)

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `SUPABASE_URL` | URL del proyecto Supabase | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Clave anónima (pública) | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service_role (privada, bypass RLS) | `eyJ...` |
| `PORT` | Puerto del servidor Express | `3001` |
| `NODE_ENV` | Entorno de ejecución | `development` |
| `FRONTEND_URL` | URL del frontend (CORS) | `http://localhost:5173` |
| `SMTP_HOST` | Host SMTP del proveedor de email | `smtp.hostinger.com` |
| `SMTP_PORT` | Puerto SMTP (465 = SSL) | `465` |
| `SMTP_USER` | Usuario SMTP | `pos@tudominio.com` |
| `SMTP_PASS` | Contraseña SMTP | `****` |
| `EMAIL_FROM` | Nombre y dirección del remitente | `Culto Orquídeas <pos@tudominio.com>` |

---

## Notificaciones por email

Al **completar** una orden, el sistema envía automáticamente un correo de confirmación al cliente **si este tiene email registrado**.

- **Proveedor**: Hostinger SMTP (puerto 465, SSL obligatorio)
- **Contenido**: número de orden, listado de productos, subtotal, descuento aplicado, costo de envío, total y método de pago
- **Diseño**: HTML con branding de Culto Orquídeas (verde oscuro + lima)
- **Fallo silencioso**: si el SMTP falla, la orden se completa igualmente (el envío de email es no-bloqueante)

---

## Esquema de base de datos

| Tabla | Descripción |
|-------|-------------|
| `products` | Catálogo de plantas con SKU, precio y stock |
| `clients` | Clientes registrados |
| `discount_codes` | Códigos de descuento con porcentaje |
| `orders` | Cabecera de órdenes (borrador o completada). `deleted_at` para soft-delete |
| `order_items` | Líneas de producto por orden |
| `inventory_logs` | Historial de movimientos de inventario |

---

## Historial de sprints

| Sprint | Estado | Descripción |
|--------|--------|-------------|
| Sprint 0 | ✅ | Infraestructura, monorepo, migraciones, seed |
| Sprint 1 | ✅ | Supabase Auth, LoginPage, Layout, Sidebar, ProtectedRoute |
| Sprint 2 | ✅ | InventarioPage CRUD completo (soft-delete, inventory_logs) |
| Sprint 3 | ✅ | POSPage + rutas backend clients/discountCodes/orders |
| Sprint 4 | ✅ | ClientesPage + DescuentosPage CRUD |
| Sprint 5 | ✅ | OrdenesPage paginada, filtros, detalle, completar/eliminar borradores |
| Sprint 6 | ✅ | /api/inventory-logs + HistorialPage |
| Sprint 7 | ✅ | /api/analytics (4 endpoints) + AnalisisPage con Recharts |
| Sprint 8 | ✅ | Notificaciones por email (Nodemailer + Hostinger SMTP) |
| Sprint 9 | ✅ | DashboardPage KPIs, alertas, AreaChart, últimas órdenes |
| Sprint 10 | ✅ | Deploy Hostinger Node.js App — https://pos.cultorquideas.com |
| Post-deploy | ✅ | Optimización mobile completa + branding (logo y favicon) |
| Post-deploy | ✅ | Eliminar cualquier orden con reversión de inventario + tab "Eliminadas" |
| Post-deploy | ✅ | Editar borradores desde POS + KPIs con filtro de período + Análisis de descuentos |
| Post-deploy | ✅ | Teléfono nullable en clientes + selector rango fechas con calendario (react-day-picker) + comparativo analítica (año anterior / período anterior) |
| Post-deploy | ✅ | Fix inventario paginado en analytics (límite 1000 filas PostgREST) + reordenamiento KPI cards + shipping excluido de Ingresos Totales |
| Post-deploy | ✅ | Fix UX date picker: botón "Aplicar" — los datos no se recargan hasta seleccionar inicio y fin |
| Post-deploy | ✅ | Ajuste de precio por ítem en POS (tarjeta editora) + precio ajustado en email (HTML y texto plano) |
| Post-deploy | ✅ | Descarga de órdenes completadas en PDF desde modal de detalle (client-side, @react-pdf/renderer) |
| Post-deploy | ✅ | Búsqueda en OrdenesPage por nombre de cliente, email o número de orden (debounced 400ms) |
| Post-deploy | ✅ | Seguridad: Helmet (headers HTTP), rate limiting 200 req/15 min, validación longitud de búsqueda |

---

## Seguridad

| Capa | Mecanismo |
|------|-----------|
| Autenticación | Supabase Auth (JWT) — todas las rutas `/api/*` excepto `/api/health` requieren Bearer token válido |
| CORS | Restringido al dominio del frontend (`FRONTEND_URL`) — rechaza orígenes externos |
| Headers HTTP | **Helmet.js** — activa `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy` y más (CSP desactivado por compatibilidad con el SPA) |
| Rate limiting | **express-rate-limit** — 200 req / 15 min por IP en todas las rutas `/api/*`. HTTP 429 al superarlo |
| Validación inputs | `?search=` truncado a 100 caracteres; límites en paginación (`limit` máx. 200) |
| Inyección SQL | No aplica — Supabase JS client usa queries parametrizadas; no se construyen queries con string concatenation |
| Secrets | Variables de entorno en Hostinger; `service_role_key` nunca expuesta al frontend |

---

## Deploy — Hostinger Node.js App

**URL de producción**: https://pos.cultorquideas.com

### Arquitectura en producción
Express sirve tanto la API (`/api/*`) como el frontend estático (`backend/public/`) desde un único proceso Node.js. El bloque de static serving se activa con `NODE_ENV=production`.

### Workflow de deploy

```bash
# 1. Build local — compila frontend (Vite) + backend (TypeScript)
cd backend && npm run build:full

# 2. Commit incluyendo los artefactos compilados
git add -A && git commit -m "descripción"
git push

# 3. En hPanel: Deploy → Restart
```

> **⚠️ Importante**: `backend/dist/` y `backend/public/` están commiteados en el repo.
> Hostinger solo ejecuta `npm install` + `node dist/index.js`, sin compilar en el servidor.
> Si se modifica TypeScript del backend sin correr `npm run build:ts`, los cambios no llegarán a producción.

### `build:full` vs `build:ts`

| Script | Comando | Cuándo usarlo |
|--------|---------|---------------|
| `build:full` | `npm --prefix ../frontend run build && npm run build:ts` | Cambios en frontend Y/O backend |
| `build:ts` | `tsc` | Solo cambios en backend TypeScript |

### Variables de entorno en Hostinger
| Variable | Valor |
|----------|-------|
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | `https://aisjzorranmtnitjzban.supabase.co` |
| `SUPABASE_ANON_KEY` | *(anon key)* |
| `SUPABASE_SERVICE_ROLE_KEY` | *(service role key)* |
| `FRONTEND_URL` | `https://pos.cultorquideas.com` |
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | *(email SMTP)* |
| `SMTP_PASS` | *(contraseña SMTP)* |
| `EMAIL_FROM` | `Culto Orquídeas <pos@tudominio.com>` |

---

## Importación de productos desde WooCommerce

El script `scripts/import-products.ts` importa un CSV de WooCommerce a Supabase.

### Formato del CSV

```
sku,name,stock,price
665,Aeragnis luteoalba var rhodostipta,1,90000
666,Andinea dalstroemii,1,740000
```

- Soporta delimitador coma (`,`) o tabulador (`\t`)
- Acepta o no encabezado
- **SKUs de 3 dígitos son válidos**: el script los rellena con cero → `665` → `0665`

### Uso

```bash
# Vista previa sin insertar
cd backend
npx ts-node-dev --transpile-only ../scripts/import-products.ts ../ruta/productos.csv --dry-run

# Inserción con credenciales de Supabase (recomendado)
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
npx ts-node-dev --transpile-only ../scripts/import-products.ts ../ruta/productos.csv
```

### Comportamiento

- SKUs duplicados son omitidos (no sobrescriben)
- Stock `0` es válido
- Muestra resumen final: insertados / omitidos / errores

---

## Licencia

Uso interno — Culto Orquídeas © 2025–2026
