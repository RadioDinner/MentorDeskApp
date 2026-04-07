import { useAuth } from '../../context/AuthContext'

interface TopbarProps {
  title: string
}

export default function Topbar({ title }: TopbarProps) {
  const { profile } = useAuth()

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-200">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {profile && (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-700">
            {profile.first_name[0]}{profile.last_name[0]}
          </div>
          <span className="text-sm text-gray-700">{profile.first_name} {profile.last_name}</span>
        </div>
      )}
    </header>
  )
}
