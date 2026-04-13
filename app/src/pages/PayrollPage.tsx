import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseRestGet } from '../lib/supabase'
import { useLoadingGuard } from '../hooks/useLoadingGuard'
import LoadingErrorState from '../components/LoadingErrorState'
import TimeCardModal from '../components/TimeCardModal'
import type { TimeCardFormData } from '../components/TimeCardModal'
import { logAudit } from '../lib/audit'
import { formatDollars, parseDateOnly } from '../lib/format'
import { Button, Badge } from '../components/ui'
import { PAY_FREQUENCY_LABELS, STAFF_ROLE_LABELS } from '../types'
import type { StaffMember, PayType, PayFrequency, TimeCard, Offering } from '../types'
import { Skeleton } from '../components/ui'

interface PayrollRow {
  staff: StaffMember
  hoursInPeriod: number
  estimatedPay: number | null  // null means "can't compute — pending payroll engine"
  formula: string
  offering?: Offering | null
}

function monthBounds(ym: string): { start: string; end: string } {
  // ym = 'YYYY-MM'
  const [y, m] = ym.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 0)
  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: toIso(start), end: toIso(end) }
}

function currentMonthYM(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Compute the dollar amount a salaried staff member should receive for
 * the selected pay period. The interpretation depends on frequency:
 *   - weekly   : rate is per week. Multiply by whole weeks in the period.
 *   - bi_weekly: rate is per 2 weeks. Multiply by period_days / 14.
 *   - semi_monthly: rate is per half-month. 2 payouts per calendar month.
 *   - monthly  : rate is per calendar month.
 *   - annually : rate is per year. Divide by days_in_year, multiply by period days.
 * Uses simple day-based proration for partial periods.
 */
function salaryForPeriod(rate: number, freq: PayFrequency | null, start: string, end: string): number {
  const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1)
  switch (freq) {
    case 'weekly':       return (rate / 7) * days
    case 'bi_weekly':    return (rate / 14) * days
    case 'semi_monthly': return (rate / 15) * days
    case 'monthly':      return (rate / 30) * days
    case 'annually':     return (rate / 365) * days
    default:             return rate // unknown frequency: just show the raw rate
  }
}

const PAY_TYPE_LABELS: Record<PayType, string> = {
  hourly: 'Hourly',
  salary: 'Salary',
  pct_monthly_profit: '% of monthly profit',
  pct_engagement_profit: '% of a specific engagement',
  pct_course_profit: '% of a specific course',
  pct_per_meeting: '% of each completed meeting',
}

export default function PayrollPage() {
  const { profile } = useAuth()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [timeCards, setTimeCards] = useState<TimeCard[]>([])
  const [offerings, setOfferings] = useState<Offering[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [periodYM, setPeriodYM] = useState<string>(currentMonthYM())
  const [showTimeCardModal, setShowTimeCardModal] = useState(false)

  useLoadingGuard(loading, useCallback(() => {
    setLoading(false)
    setError('Request timed out. The server may be slow or unreachable.')
  }, []), 15000)

  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    if (!profile?.organization_id) { setLoading(false); return }
    const orgId = profile.organization_id
    const { start, end } = monthBounds(periodYM)

    async function loadAll() {
      setLoading(true)
      setError(null)
      try {
        const [staffRes, tcRes, offRes] = await Promise.all([
          supabaseRestGet<StaffMember>(
            'staff',
            `select=*&organization_id=eq.${orgId}&archived_at=is.null&order=first_name.asc`,
            { label: 'payroll:staff' },
          ),
          supabaseRestGet<TimeCard>(
            'time_cards',
            `select=*&organization_id=eq.${orgId}&period_start=lte.${end}&period_end=gte.${start}&order=period_start.desc`,
            { label: 'payroll:timecards' },
          ),
          supabaseRestGet<Offering>(
            'offerings',
            `select=*&organization_id=eq.${orgId}`,
            { label: 'payroll:offerings' },
          ),
        ])
        if (staffRes.error) { setError(staffRes.error.message); return }
        if (tcRes.error) { setError(tcRes.error.message); return }
        if (offRes.error) { setError(offRes.error.message); return }
        setStaff(staffRes.data ?? [])
        setTimeCards(tcRes.data ?? [])
        setOfferings(offRes.data ?? [])
      } catch (err) {
        setError((err as Error).message || 'Failed to load')
        console.error('[PayrollPage] loadAll error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = loadAll
    loadAll()
  }, [profile?.organization_id, periodYM])

  // ─────────── Derived ───────────

  const period = monthBounds(periodYM)
  const offeringById = useMemo(() => new Map(offerings.map(o => [o.id, o])), [offerings])

  const payrollRows: PayrollRow[] = useMemo(() => {
    return staff
      .filter(s => s.pay_type && s.role !== 'admin')
      .map(s => {
        const staffTimeCards = timeCards.filter(tc => tc.staff_id === s.id)
        const hoursInPeriod = staffTimeCards.reduce((sum, tc) => sum + Number(tc.hours_worked), 0)
        const rate = s.pay_rate ?? 0
        const offering = s.pay_offering_id ? (offeringById.get(s.pay_offering_id) ?? null) : null

        let estimatedPay: number | null = null
        let formula = ''

        switch (s.pay_type) {
          case 'hourly':
            estimatedPay = hoursInPeriod * rate
            formula = `${hoursInPeriod.toFixed(2)} h × ${formatDollars(rate)}/h`
            break
          case 'salary':
            estimatedPay = salaryForPeriod(rate, s.pay_frequency, period.start, period.end)
            formula = `${formatDollars(rate)} ${PAY_FREQUENCY_LABELS[s.pay_frequency ?? 'monthly']}, prorated by period length`
            break
          case 'pct_per_meeting':
            estimatedPay = null
            formula = `${rate}% of completed meetings (pending payroll engine)`
            break
          case 'pct_engagement_profit':
            estimatedPay = null
            formula = offering
              ? `${rate}% of ${offering.name} profit (pending)`
              : `${rate}% of engagement profit — no offering linked`
            break
          case 'pct_course_profit':
            estimatedPay = null
            formula = offering
              ? `${rate}% of ${offering.name} profit (pending)`
              : `${rate}% of course profit — no offering linked`
            break
          case 'pct_monthly_profit':
            estimatedPay = null
            formula = `${rate}% of monthly org profit (pending)`
            break
          default:
            estimatedPay = null
            formula = '—'
        }

        return { staff: s, hoursInPeriod, estimatedPay, formula, offering }
      })
      // Sort by role then name for a stable layout
      .sort((a, b) => {
        if (a.staff.role !== b.staff.role) return a.staff.role.localeCompare(b.staff.role)
        return `${a.staff.first_name} ${a.staff.last_name}`.localeCompare(`${b.staff.first_name} ${b.staff.last_name}`)
      })
  }, [staff, timeCards, offeringById, period.start, period.end])

  const totals = useMemo(() => {
    let computed = 0
    let pending = 0
    for (const row of payrollRows) {
      if (row.estimatedPay != null) computed += row.estimatedPay
      else pending += 1
    }
    return { computed, pending }
  }, [payrollRows])

  // ─────────── Save handler for time card modal ───────────

  async function saveTimeCard(data: TimeCardFormData) {
    if (!profile) return
    const insert = {
      organization_id: profile.organization_id,
      staff_id: data.staff_id,
      period_start: data.period_start,
      period_end: data.period_end,
      hours_worked: data.hours_worked,
      notes: data.notes,
      document_data_url: data.document_data_url,
      document_name: data.document_name,
      entered_by: profile.id,
    }
    const { data: inserted, error: err } = await supabase
      .from('time_cards')
      .insert(insert)
      .select()
      .single()
    if (err) throw new Error(err.message)
    if (inserted) setTimeCards(prev => [inserted as TimeCard, ...prev])
    await logAudit({
      organization_id: profile.organization_id,
      actor_id: profile.id,
      action: 'created',
      entity_type: 'staff',
      entity_id: data.staff_id,
      details: {
        scope: 'time_card',
        period_start: data.period_start,
        period_end: data.period_end,
        hours_worked: data.hours_worked,
        has_document: !!data.document_data_url,
      },
    })
    setShowTimeCardModal(false)
  }

  // ─────────── Render ───────────

  return (
    <div className="max-w-7xl">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Computed pay for the selected period. Enter time cards manually until self-serve time tracking ships.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="payrollPeriod" className="text-xs font-medium text-gray-500">Period</label>
            <input
              id="payrollPeriod"
              type="month"
              value={periodYM}
              onChange={e => setPeriodYM(e.target.value)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
            />
          </div>
          <Button onClick={() => setShowTimeCardModal(true)}>
            + Enter Time Card
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Period</p>
          <p className="text-base font-semibold text-gray-900 mt-2">
            {parseDateOnly(period.start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">{period.start} → {period.end}</p>
        </div>
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Computed total</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{formatDollars(totals.computed)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Hourly + salary rows</p>
        </div>
        <div className="bg-white rounded-md border border-gray-200/80 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">Pending rows</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{totals.pending}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">% types — calculated in a future release</p>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <Skeleton count={8} className="h-11 w-full" gap="gap-2" />
      ) : error ? (
        <LoadingErrorState message={error} onRetry={() => fetchRef.current()} />
      ) : payrollRows.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No staff have a pay type configured.</p>
          <p className="text-xs text-gray-400 mt-1">Set a pay type on each staff member from the People edit screen.</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-gray-200/80 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Pay Type</th>
                <th className="px-4 py-3 text-right">Hours</th>
                <th className="px-4 py-3">Formula</th>
                <th className="px-4 py-3 text-right">Estimated Pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payrollRows.map(row => (
                <tr key={row.staff.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">
                      {row.staff.first_name} {row.staff.last_name}
                    </p>
                    <p className="text-[10px] text-gray-400">{row.staff.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="neutral">
                      {STAFF_ROLE_LABELS[row.staff.role] ?? row.staff.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {row.staff.pay_type ? PAY_TYPE_LABELS[row.staff.pay_type] : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-gray-700">
                    {row.staff.pay_type === 'hourly' ? row.hoursInPeriod.toFixed(2) : '—'}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-gray-500 max-w-xs truncate">
                    {row.formula}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.estimatedPay != null ? (
                      <p className="text-sm font-semibold text-gray-900 tabular-nums">
                        {formatDollars(row.estimatedPay)}
                      </p>
                    ) : (
                      <span className="text-[11px] text-amber-600 font-medium">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Time card modal */}
      {showTimeCardModal && (
        <TimeCardModal
          eligibleStaff={staff.filter(s => s.role !== 'admin')}
          defaultPeriodStart={period.start}
          defaultPeriodEnd={period.end}
          onSave={saveTimeCard}
          onClose={() => setShowTimeCardModal(false)}
        />
      )}
    </div>
  )
}
