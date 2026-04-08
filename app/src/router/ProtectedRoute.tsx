import React, { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { reportError } from '../lib/errorReporter'
import type { StaffRole } from '../types'

interface ProtectedRouteProps {
  children: React.ReactElement
  allowedRoles?: StaffRole[]
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { session, user, profile, loading, allProfiles, activeProfileId, isMenteeMode } = useAuth()
  const [timedOut, setTimedOut] = useState(false)
  const [reported, setReported] = useState(false)
  const [reporting, setReporting] = useState(false)
  const loadStartRef = useRef(Date.now())

  // Track how long we've been loading
  useEffect(() => {
    if (loading) {
      loadStartRef.current = Date.now()
    }
  }, [loading])

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

  async function handleReportBug() {
    setReporting(true)
    try {
      // Collect comprehensive diagnostic info
      const loadDuration = Date.now() - loadStartRef.current

      // Check Supabase session directly
      let sessionInfo: Record<string, unknown> = { error: 'could not fetch' }
      try {
        const { data, error } = await supabase.auth.getSession()
        sessionInfo = {
          hasSession: !!data.session,
          userId: data.session?.user?.id ?? null,
          email: data.session?.user?.email ?? null,
          expiresAt: data.session?.expires_at ?? null,
          error: error?.message ?? null,
        }
      } catch (e) {
        sessionInfo = { error: (e as Error).message }
      }

      // Check staff records directly
      let staffInfo: Record<string, unknown> = { error: 'could not fetch' }
      try {
        if (sessionInfo.userId) {
          const { data, error } = await supabase
            .from('staff')
            .select('id, role, organization_id, user_id, email, archived_at')
            .eq('user_id', sessionInfo.userId as string)
          staffInfo = {
            count: data?.length ?? 0,
            records: data?.map(s => ({ id: s.id, role: s.role, org: s.organization_id, archived: s.archived_at })) ?? [],
            error: error?.message ?? null,
          }
        } else {
          staffInfo = { error: 'no userId from session' }
        }
      } catch (e) {
        staffInfo = { error: (e as Error).message }
      }

      // Check my_organization_id() RPC
      let orgIdInfo: Record<string, unknown> = { error: 'could not fetch' }
      try {
        const { data, error } = await supabase.rpc('my_organization_id')
        orgIdInfo = { result: data, error: error?.message ?? null }
      } catch (e) {
        orgIdInfo = { error: (e as Error).message }
      }

      await reportError({
        error_message: `Loading screen stuck for ${Math.round(loadDuration / 1000)}s — user reported`,
        error_code: 'LOADING_STUCK',
        page: window.location.pathname,
        component: 'ProtectedRoute',
        action: 'user_bug_report',
        metadata: {
          loadDuration_ms: loadDuration,
          authContext: {
            loading,
            hasSession: !!session,
            hasUser: !!user,
            userId: user?.id ?? null,
            userEmail: user?.email ?? null,
            hasProfile: !!profile,
            profileId: profile?.id ?? null,
            profileRole: profile?.role ?? null,
            profileOrgId: profile?.organization_id ?? null,
            allProfilesCount: allProfiles.length,
            activeProfileId,
            isMenteeMode,
          },
          supabaseSession: sessionInfo,
          staffRecords: staffInfo,
          myOrganizationId: orgIdInfo,
          browser: {
            userAgent: navigator.userAgent,
            url: window.location.href,
            timestamp: new Date().toISOString(),
          },
        },
      })

      setReported(true)
    } catch (e) {
      console.error('[ProtectedRoute] Failed to report bug:', e)
    } finally {
      setReporting(false)
    }
  }

  if (loading && !timedOut) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="text-sm text-gray-500">Loading…</div>
        {!reported ? (
          <button
            onClick={handleReportBug}
            disabled={reporting}
            className="px-4 py-2 text-xs font-medium text-gray-500 border border-gray-200 rounded hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 transition-colors"
          >
            {reporting ? 'Reporting…' : 'Report bug occurrence'}
          </button>
        ) : (
          <p className="text-xs text-green-600">Bug reported — thank you!</p>
        )}
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
