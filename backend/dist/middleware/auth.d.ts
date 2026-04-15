import { Request, Response, NextFunction } from 'express';
export type UserRole = 'admin' | 'vendedor';
export interface AuthRequest extends Request {
    userId?: string;
    userEmail?: string;
    userRole?: UserRole;
}
/**
 * Middleware de autenticación — valida el JWT de Supabase
 * en todas las rutas protegidas del backend.
 */
export declare function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=auth.d.ts.map