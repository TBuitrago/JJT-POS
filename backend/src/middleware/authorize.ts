import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'

/**
 * Middleware que bloquea la petición si el usuario no es admin.
 * Uso: router.post('/', requireAdmin, handler)
 */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.userRole !== 'admin') {
    res.status(403).json({ error: 'No autorizado — se requiere rol de administrador' })
    return
  }
  next()
}
