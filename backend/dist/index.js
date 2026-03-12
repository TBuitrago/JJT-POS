"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const products_1 = __importDefault(require("./routes/products"));
const clients_1 = __importDefault(require("./routes/clients"));
const discountCodes_1 = __importDefault(require("./routes/discountCodes"));
const orders_1 = __importDefault(require("./routes/orders"));
const inventoryLogs_1 = __importDefault(require("./routes/inventoryLogs"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// ── Seguridad: headers HTTP ──────────────────────────────────────────────────
// CSP desactivado intencionalmente: el SPA (React + recharts + react-pdf)
// usa scripts inline y eval; activar CSP sin whitelist exhaustiva lo rompe.
app.use((0, helmet_1.default)({ contentSecurityPolicy: false }));
// ── Seguridad: rate limiting ─────────────────────────────────────────────────
// 200 req / 15 min por IP — uso legítimo del POS está muy por debajo de este límite
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true, // devuelve RateLimit-* headers (RFC 6585)
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.' },
});
app.use('/api', apiLimiter);
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express_1.default.json());
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'Culto Orquídeas POS API',
        version: '0.9.0',
        timestamp: new Date().toISOString(),
    });
});
app.use('/api/products', products_1.default);
app.use('/api/clients', clients_1.default);
app.use('/api/discount-codes', discountCodes_1.default);
app.use('/api/orders', orders_1.default);
app.use('/api/inventory-logs', inventoryLogs_1.default);
app.use('/api/analytics', analytics_1.default);
// ── Producción: servir frontend estático ─────────────────────────────────────
// El frontend compilado (vite build) se deposita en backend/public/
// Express lo sirve como archivos estáticos y devuelve index.html para
// cualquier ruta que no sea /api (SPA fallback para React Router)
if (process.env.NODE_ENV === 'production') {
    const publicPath = path_1.default.join(__dirname, '..', 'public');
    app.use(express_1.default.static(publicPath));
    app.get('*', (_req, res) => {
        res.sendFile(path_1.default.join(publicPath, 'index.html'));
    });
}
app.listen(PORT, () => {
    console.log(`🌿 Culto Orquídeas API corriendo en http://localhost:${PORT}`);
});
exports.default = app;
//# sourceMappingURL=index.js.map