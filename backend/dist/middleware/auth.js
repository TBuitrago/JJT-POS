"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
/**
 * Middleware de autenticación — valida el JWT de Supabase
 * en todas las rutas protegidas del backend.
 */
async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No autorizado — token requerido' });
        return;
    }
    const token = authHeader.split(' ')[1];
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
        res.status(401).json({ error: 'Token inválido o expirado' });
        return;
    }
    req.userId = data.user.id;
    req.userEmail = data.user.email ?? 'Admin';
    next();
}
//# sourceMappingURL=auth.js.map