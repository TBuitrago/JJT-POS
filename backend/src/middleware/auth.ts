import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type UserRole = 'admin' | 'vendedor'

export interface AuthRequest extends Request {
  userId?: string
  userEmail?: string
  userRole?: UserRole
}

/**
 * Middleware de autenticación — valida el JWT de Supabase
 * en todas las rutas protegidas del backend.
 */
export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado — token requerido' })
    return
  }

  const token = authHeader.split(' ')[1]
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) {
    res.status(401).json({ error: 'Token inválido o expirado' })
    return
  }

  req.userId = data.user.id
  req.userEmail = data.user.email ?? 'Admin'

  // Obtener rol del usuario desde user_profiles
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle()

  req.userRole = (profile?.role as UserRole) ?? 'vendedor'

  next()
}
