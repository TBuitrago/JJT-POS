import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import authRouter from './routes/auth'
import productsRouter from './routes/products'
import clientsRouter from './routes/clients'
import discountCodesRouter from './routes/discountCodes'
import ordersRouter from './routes/orders'
import inventoryLogsRouter from './routes/inventoryLogs'
import analyticsRouter from './routes/analytics'

const app = express()
const PORT = process.env.PORT || 3001

// ── Seguridad: headers HTTP ──────────────────────────────────────────────────
// CSP desactivado intencionalmente: el SPA (React + recharts + react-pdf)
// usa scripts inline y eval; activar CSP sin whitelist exhaustiva lo rompe.
app.use(helmet({ contentSecurityPolicy: false }))

// ── Seguridad: rate limiting ─────────────────────────────────────────────────
// 200 req / 15 min por IP — uso legítimo del POS está muy por debajo de este límite
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,   // devuelve RateLimit-* headers (RFC 6585)
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.' },
})
app.use('/api', apiLimiter)

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Culto Orquídeas POS API',
    version: '0.9.0',
    timestamp: new Date().toISOString(),
  })
})

app.use('/api/auth', authRouter)
app.use('/api/products', productsRouter)
app.use('/api/clients', clientsRouter)
app.use('/api/discount-codes', discountCodesRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/inventory-logs', inventoryLogsRouter)
app.use('/api/analytics', analyticsRouter)

// ── Producción: servir frontend estático ─────────────────────────────────────
// El frontend compilado (vite build) se deposita en backend/public/
// Express lo sirve como archivos estáticos y devuelve index.html para
// cualquier ruta que no sea /api (SPA fallback para React Router)
if (process.env.NODE_ENV === 'production') {
  const publicPath = path.join(__dirname, '..', 'public')
  app.use(express.static(publicPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`🌿 Culto Orquídeas API corriendo en http://localhost:${PORT}`)
})

export default app
