import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authMiddleware)

// ============================================================
// GET /api/auth/me — obtener perfil del usuario autenticado
// ============================================================
router.get('/me', async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({
    data: {
      id: req.userId,
      email: req.userEmail,
      role: req.userRole,
    },
  })
})

export default router
