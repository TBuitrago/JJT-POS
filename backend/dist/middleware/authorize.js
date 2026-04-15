"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = requireAdmin;
/**
 * Middleware que bloquea la petición si el usuario no es admin.
 * Uso: router.post('/', requireAdmin, handler)
 */
function requireAdmin(req, res, next) {
    if (req.userRole !== 'admin') {
        res.status(403).json({ error: 'No autorizado — se requiere rol de administrador' });
        return;
    }
    next();
}
//# sourceMappingURL=authorize.js.map