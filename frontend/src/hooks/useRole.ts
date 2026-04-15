import { useAuthStore } from '@/store/authStore'

export function useIsAdmin() {
  return useAuthStore((s) => s.role === 'admin')
}

export function useCanEdit(createdBy: string | null | undefined) {
  const userId = useAuthStore((s) => s.user?.id)
  const isAdmin = useAuthStore((s) => s.role === 'admin')
  if (isAdmin) return true
  if (!createdBy || !userId) return false
  return createdBy === userId
}
