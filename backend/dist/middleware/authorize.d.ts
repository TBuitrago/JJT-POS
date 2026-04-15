import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
/**
 * Middleware que bloquea la petición si el usuario no es admin.
 * Uso: router.post('/', requireAdmin, handler)
 */
export declare function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void;
//# sourceMappingURL=authorize.d.ts.map