import React, { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { StaffRole } from '../types'

interface ProtectedRouteProps {
  children: React.ReactElement
  allowedRoles?: StaffRole[]
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth()
  const [timedOut, setTimedOut] = useState(false)

  // Safety: if loading stays true for more than 8 seconds, force-clear it
  useEffect(() => {
    if (!loading) {
      setTimedOut(false)
      return
    }
    const timer = setTimeout(() => {
      console.warn('[ProtectedRoute] Auth loading timed out after 8s — forcing through')
      setTimedOut(true)
    }, 8000)
    return () => clearTimeout(timer)
  }, [loading])

  if (loading && !timedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
