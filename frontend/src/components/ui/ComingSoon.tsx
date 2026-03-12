import { LucideIcon } from 'lucide-react'

interface ComingSoonProps {
  title: string
  description: string
  icon: LucideIcon
  sprint: number
}

export default function ComingSoon({ title, description, icon: Icon, sprint }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mb-5">
        <Icon size={28} className="text-brand-lime" />
      </div>
      <h1 className="text-2xl font-bold text-brand-white mb-2">{title}</h1>
      <p className="text-white/50 text-sm max-w-xs mb-4">{description}</p>
      <span className="text-xs bg-brand-lime/20 text-brand-lime px-3 py-1 rounded-full font-medium">
        Sprint {sprint}
      </span>
    </div>
  )
}
