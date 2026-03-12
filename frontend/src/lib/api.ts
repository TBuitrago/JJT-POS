import axios from 'axios'
import { supabase } from './supabase'

const api = axios.create({
  // En producción: URL relativa (mismo dominio, Express sirve /api/*)
  // En desarrollo: Vite proxy redirige /api/* → localhost:3001
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptor: adjunta el JWT de Supabase en cada request
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor: manejo global de errores 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await supabase.auth.signOut()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
