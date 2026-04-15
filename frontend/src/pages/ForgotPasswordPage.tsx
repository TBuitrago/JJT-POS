import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, ArrowLeft, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import logo from '@/assets/logo_culto.webp'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)

    if (error) {
      setError('No se pudo enviar el correo. Intenta de nuevo.')
      return
    }

    setSent(true)
  }

  return (
    <div className="min-h-screen bg-brand-green flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src={logo} alt="Culto Orquídeas" className="h-16 w-auto max-w-[220px] mix-blend-luminosity brightness-150 mb-4" />
          <p className="text-white/40 text-sm">Restaurar contraseña</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <Mail size={48} className="text-white/60" />
            </div>
            <p className="text-white/80 text-sm">
              Si el correo <span className="font-medium text-white">{email}</span> está registrado,
              recibirás un enlace para restablecer tu contraseña.
            </p>
            <p className="text-white/40 text-xs">
              Revisa tu bandeja de entrada y carpeta de spam.
            </p>
            <Link
              to="/login"
              className="btn-primary w-full flex items-center justify-center gap-2 mt-4"
            >
              <ArrowLeft size={16} />
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label" htmlFor="email">Correo electrónico</label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm text-center bg-red-400/10 rounded-lg py-2 px-3">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar enlace de recuperación'
                )}
              </button>
            </form>

            <Link
              to="/login"
              className="flex items-center justify-center gap-1 text-white/40 text-sm mt-6 hover:text-white/60 transition-colors"
            >
              <ArrowLeft size={14} />
              Volver al inicio de sesión
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
