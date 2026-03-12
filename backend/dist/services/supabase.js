"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
}
// Cliente con service_role para operaciones del backend (bypass RLS)
exports.supabaseAdmin = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
//# sourceMappingURL=supabase.js.map