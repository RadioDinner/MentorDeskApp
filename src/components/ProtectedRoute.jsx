import { Navigate } from 'react-router-dom'
import { useRole } from '../context/RoleContext'

export default function ProtectedRoute({ session, allowed, children }) {
  const { activeRole, roles } = useRole()
  if (!session) return <Navigate to="/login" replace />
  // Don't redirect while roles are still loading
  if (roles === undefined || activeRole === undefined) return null
  // Allow access if the user has any of the allowed roles (not just the active one)
  if (!allowed.includes(activeRole) && !allowed.some(r => roles.includes(r))) return <Navigate to="/" replace />
  return children
}
