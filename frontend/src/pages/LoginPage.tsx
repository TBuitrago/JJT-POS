import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import logo from '@/assets/logo_culto.webp'

export default function LoginPage() {
  const navigate = useNavigate()
  const { signIn, loading } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const { error } = await signIn(email, password)
    if (error) {
      setError('Correo o contraseña incorrectos')
      return
    }
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-brand-green flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src={logo} alt="Culto Orquídeas" className="h-16 w-auto max-w-[220px] mix-blend-luminosity brightness-150 mb-4" />
          <p className="text-white/40 text-sm">Sistema de Punto de Venta</p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="admin@cultorquideas.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div>
            <label className="label" htmlFor="password">Contraseña</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="input pr-10"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
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
                Ingresando...
              </>
            ) : (
              'Iniciar sesión'
            )}
          </button>
        </form>

        <Link
          to="/forgot-password"
          className="block text-white/40 text-sm text-center mt-6 hover:text-white/60 transition-colors"
        >
          ¿Olvidaste tu contraseña?
        </Link>

        <p className="text-white/20 text-xs text-center mt-4">
          Acceso exclusivo para personal autorizado
        </p>
      </div>
    </div>
  )
}
