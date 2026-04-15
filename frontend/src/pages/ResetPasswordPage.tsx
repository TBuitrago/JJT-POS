import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, CheckCircle, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import logo from '@/assets/logo_culto.webp'

const PASSWORD_RULES = [
  { key: 'length', label: 'Mínimo 8 caracteres', test: (p: string) => p.length >= 8 },
  { key: 'lowercase', label: 'Al menos una minúscula', test: (p: string) => /[a-z]/.test(p) },
  { key: 'uppercase', label: 'Al menos una mayúscula', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'digit', label: 'Al menos un número', test: (p: string) => /\d/.test(p) },
  { key: 'special', label: 'Al menos un carácter especial (!@#$%...)', test: (p: string) => /[^a-zA-Z0-9]/.test(p) },
] as const

function parseSupabasePasswordError(error: { message?: string; code?: string }): string {
  const msg = error.message?.toLowerCase() ?? ''

  if (msg.includes('weak') || msg.includes('strength'))
    return 'La contraseña no cumple los requisitos de seguridad. Revisa los indicadores abajo.'

  if (msg.includes('same_password') || msg.includes('different'))
    return 'La nueva contraseña debe ser diferente a la anterior.'

  if (msg.includes('too short') || msg.includes('length'))
    return 'La contraseña es muy corta.'

  return 'No se pudo actualizar la contraseña. Intenta de nuevo.'
}

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { session, initialized, signOut } = useAuthStore()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Wait briefly for Supabase to process recovery token from URL hash
  const [waitingForToken, setWaitingForToken] = useState(() =>
    window.location.hash.includes('type=recovery')
  )

  useEffect(() => {
    if (session) setWaitingForToken(false)

    if (waitingForToken && !session) {
      const timer = setTimeout(() => setWaitingForToken(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [session, waitingForToken])

  const allRulesPass = PASSWORD_RULES.every((r) => r.test(password))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!allRulesPass) {
      setError('La contraseña no cumple todos los requisitos.')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password })

    setLoading(false)

    if (error) {
      setError(parseSupabasePasswordError(error))
      return
    }

    setSuccess(true)

    setTimeout(async () => {
      await signOut()
      navigate('/login', { replace: true })
    }, 2000)
  }

  // Loading auth state or processing recovery token
  if (!initialized || waitingForToken) {
    return (
      <div className="min-h-screen bg-brand-green flex items-center justify-center">
        <Loader2 size={32} className="text-white/60 animate-spin" />
      </div>
    )
  }

  // No session = invalid or expired link
  if (!session) {
    return (
      <div className="min-h-screen bg-brand-green flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="flex flex-col items-center mb-10">
            <img src={logo} alt="Culto Orquídeas" className="h-16 w-auto max-w-[220px] mix-blend-luminosity brightness-150 mb-4" />
          </div>
          <p className="text-white/80 text-sm">
            El enlace de recuperación es inválido o ha expirado.
          </p>
          <button
            onClick={() => navigate('/forgot-password')}
            className="btn-primary w-full mt-4"
          >
            Solicitar nuevo enlace
          </button>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-brand-green flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="flex flex-col items-center mb-10">
            <img src={logo} alt="Culto Orquídeas" className="h-16 w-auto max-w-[220px] mix-blend-luminosity brightness-150 mb-4" />
          </div>
          <CheckCircle size={48} className="text-green-400 mx-auto" />
          <p className="text-white/80 text-sm">
            Contraseña actualizada correctamente.
          </p>
          <p className="text-white/40 text-xs">
            Redirigiendo al inicio de sesión...
          </p>
        </div>
      </div>
    )
  }

  // Password reset form
  return (
    <div className="min-h-screen bg-brand-green flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src={logo} alt="Culto Orquídeas" className="h-16 w-auto max-w-[220px] mix-blend-luminosity brightness-150 mb-4" />
          <p className="text-white/40 text-sm">Nueva contraseña</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="password">Nueva contraseña</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="input pr-10"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                autoFocus
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="confirmPassword">Confirmar contraseña</label>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              className="input"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          {/* Indicadores de requisitos */}
          {password.length > 0 && (
            <ul className="space-y-1">
              {PASSWORD_RULES.map((rule) => {
                const passes = rule.test(password)
                return (
                  <li key={rule.key} className="flex items-center gap-2 text-xs">
                    {passes
                      ? <Check size={12} className="text-green-400 shrink-0" />
                      : <X size={12} className="text-white/30 shrink-0" />}
                    <span className={passes ? 'text-green-400' : 'text-white/40'}>
                      {rule.label}
                    </span>
                  </li>
                )
              })}
              {confirmPassword.length > 0 && (
                <li className="flex items-center gap-2 text-xs">
                  {password === confirmPassword
                    ? <Check size={12} className="text-green-400 shrink-0" />
                    : <X size={12} className="text-white/30 shrink-0" />}
                  <span className={password === confirmPassword ? 'text-green-400' : 'text-white/40'}>
                    Las contraseñas coinciden
                  </span>
                </li>
              )}
            </ul>
          )}

          {error && (
            <p className="text-red-400 text-sm text-center bg-red-400/10 rounded-lg py-2 px-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !allRulesPass}
            className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Actualizando...
              </>
            ) : (
              'Restablecer contraseña'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
