import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
  const { profile } = useAuth()

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-1">
        Welcome back, {profile?.first_name}
      </h1>
      <p className="text-sm text-gray-500 capitalize">{profile?.role} · {profile?.organization_id}</p>
    </div>
  )
}
