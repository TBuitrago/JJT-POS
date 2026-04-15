"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// ============================================================
// GET /api/auth/me — obtener perfil del usuario autenticado
// ============================================================
router.get('/me', async (req, res) => {
    res.json({
        data: {
            id: req.userId,
            email: req.userEmail,
            role: req.userRole,
        },
    });
});
exports.default = router;
//# sourceMappingURL=auth.js.map