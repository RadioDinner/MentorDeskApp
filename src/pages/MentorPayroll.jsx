import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ChevronLeft, ChevronRight, UserCheck, Clock } from 'lucide-react'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const PAY_TYPE_LABELS = {
  percentage: 'Percentage of Subscription Revenue',
  monthly: 'Flat Monthly Rate',
  per_meeting: 'Per-Meeting Rate',
  hourly: 'Hourly Rate',
}

function fmt(n) {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export default function MentorPayroll() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [payrollData, setPayrollData] = useState([])

  useEffect(() => {
    fetchPayroll()
  }, [year, month])

  async function fetchPayroll() {
    setLoading(true)
    setError(null)

    const periodStart = new Date(year, month, 1).toISOString()
    const periodEnd = new Date(year, month + 1, 1).toISOString()

    const [mentorsRes, menteesRes, moRes, meetingsRes] = await Promise.all([
      // All mentors that have any pay type configured
      supabase
        .from('mentors')
        .select('id, first_name, last_name, pay_type, pay_percentage, pay_rate')
        .not('pay_type', 'is', null)
        .or('pay_percentage.not.is.null,pay_rate.not.is.null')
        .order('last_name'),

      // All mentees with a mentor assigned
      supabase
        .from('mentees')
        .select('id, first_name, last_name, mentor_id')
        .not('mentor_id', 'is', null),

      // All arrangement enrollments with offering details
      supabase
        .from('mentee_offerings')
        .select('id, mentee_id, offering:offerings(id, name, cost, offering_type, meetings_per_period)'),

      // All completed meetings in the period
      supabase
        .from('meetings')
        .select('id, mentor_id, mentee_id, scheduled_at')
        .eq('status', 'completed')
        .gte('scheduled_at', periodStart)
        .lt('scheduled_at', periodEnd),
    ])

    const err = [mentorsRes, menteesRes, moRes, meetingsRes].find(r => r.error)
    if (err) { setError(err.error.message); setLoading(false); return }

    const mentors = mentorsRes.data || []
    const allMentees = menteesRes.data || []
    const arrangements = (moRes.data || []).filter(
      mo => mo.offering?.offering_type === 'arrangement'
        && mo.offering?.meetings_per_period > 0
        && mo.offering?.cost > 0
    )
    const meetings = meetingsRes.data || []

    const data = mentors.map(mentor => {
      const myMentees = allMentees.filter(m => m.mentor_id === mentor.id)
      const myMeetings = meetings.filter(m => m.mentor_id === mentor.id)
      const totalMeetingsCompleted = myMeetings.length

      let totalPayout = 0
      let detail = null

      if (mentor.pay_type === 'percentage') {
        // Per-mentee, per-offering breakdown
        // Meetings aren't linked to a specific offering, so distribute
        // each mentee's completed meetings proportionally across their
        // active arrangements based on meetings_per_period.
        const menteeRows = myMentees.map(mentee => {
          const menteeMeetings = myMeetings.filter(m => m.mentee_id === mentee.id).length
          const myArrangements = arrangements.filter(mo => mo.mentee_id === mentee.id)
          const totalEntitled = myArrangements.reduce((s, mo) => s + (mo.offering?.meetings_per_period || 0), 0)
          const offeringRows = myArrangements.map(mo => {
            const { cost, meetings_per_period, name } = mo.offering
            // Distribute meetings proportionally by each offering's share of total entitled
            const completedCount = totalEntitled > 0
              ? Math.round(menteeMeetings * (meetings_per_period / totalEntitled))
              : menteeMeetings
            const proratedAmount = completedCount * (cost / meetings_per_period)
            const mentorPayout = proratedAmount * (mentor.pay_percentage / 100)
            return { id: mo.id, offeringName: name, cost, meetings_per_period, completedCount, proratedAmount, mentorPayout }
          })
          const menteePayout = offeringRows.reduce((s, o) => s + o.mentorPayout, 0)
          return { id: mentee.id, name: `${mentee.first_name} ${mentee.last_name}`, offerings: offeringRows, totalPayout: menteePayout }
        })
        totalPayout = menteeRows.reduce((s, m) => s + m.totalPayout, 0)
        detail = { type: 'percentage', menteeRows }

      } else if (mentor.pay_type === 'monthly') {
        totalPayout = parseFloat(mentor.pay_rate || 0)
        detail = { type: 'monthly', rate: totalPayout, menteeCount: myMentees.length, meetingsCompleted: totalMeetingsCompleted }

      } else if (mentor.pay_type === 'per_meeting') {
        const rate = parseFloat(mentor.pay_rate || 0)
        // Break down by mentee for clarity
        const menteeRows = myMentees.map(mentee => {
          const count = myMeetings.filter(m => m.mentee_id === mentee.id).length
          return { id: mentee.id, name: `${mentee.first_name} ${mentee.last_name}`, meetingsCompleted: count, payout: count * rate }
        }).filter(m => m.meetingsCompleted > 0)
        totalPayout = totalMeetingsCompleted * rate
        detail = { type: 'per_meeting', rate, menteeRows, totalMeetings: totalMeetingsCompleted }

      } else if (mentor.pay_type === 'hourly') {
        // Hours tracking not yet implemented
        totalPayout = 0
        detail = { type: 'hourly', rate: parseFloat(mentor.pay_rate || 0) }
      }

      return { id: mentor.id, name: `${mentor.first_name} ${mentor.last_name}`, payType: mentor.pay_type, payPct: mentor.pay_percentage, payRate: mentor.pay_rate, totalPayout, detail }
    })

    setPayrollData(data)
    setLoading(false)
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const grandTotal = payrollData.reduce((s, m) => s + m.totalPayout, 0)

  return (
    <div style={s.container}>
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>Mentor Payroll</h1>
        <p style={s.pageSubtitle}>Mentor compensation based on completed meetings each billing period</p>
      </div>

      {/* Period selector */}
      <div style={s.periodBar}>
        <button style={s.periodBtn} onClick={prevMonth}><ChevronLeft size={16} /></button>
        <span style={s.periodLabel}>{MONTHS[month]} {year}</span>
        <button style={s.periodBtn} onClick={nextMonth}><ChevronRight size={16} /></button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {loading ? (
        <div style={s.loading}>Loading payroll data…</div>
      ) : payrollData.length === 0 ? (
        <div style={s.empty}>
          <p style={s.emptyText}>No mentors have compensation configured.</p>
          <p style={s.emptyHint}>Set a pay type on a mentor's profile to see payroll calculations here.</p>
        </div>
      ) : (
        <>
          {payrollData.map(mentor => (
            <div key={mentor.id} style={s.mentorCard}>
              {/* Mentor header */}
              <div style={s.mentorHeader}>
                <div style={s.mentorHeaderLeft}>
                  <div style={s.mentorIcon}><UserCheck size={16} color="#6366f1" /></div>
                  <div>
                    <div style={s.mentorName}>{mentor.name}</div>
                    <div style={s.mentorMeta}>{PAY_TYPE_LABELS[mentor.payType] || mentor.payType}</div>
                  </div>
                </div>
                <div style={s.mentorTotal}>
                  <span style={s.mentorTotalLabel}>Period Total</span>
                  <span style={s.mentorTotalAmount}>
                    {mentor.payType === 'hourly' ? '—' : fmt(mentor.totalPayout)}
                  </span>
                </div>
              </div>

              {/* Detail body */}
              <div style={s.detailBody}>
                {mentor.detail?.type === 'percentage' && (
                  <PercentageDetail detail={mentor.detail} payPct={mentor.payPct} />
                )}
                {mentor.detail?.type === 'monthly' && (
                  <MonthlyDetail detail={mentor.detail} period={`${MONTHS[month]} ${year}`} />
                )}
                {mentor.detail?.type === 'per_meeting' && (
                  <PerMeetingDetail detail={mentor.detail} />
                )}
                {mentor.detail?.type === 'hourly' && (
                  <HourlyDetail detail={mentor.detail} />
                )}
              </div>
            </div>
          ))}

          {/* Grand total */}
          <div style={s.grandTotal}>
            <div>
              <div style={s.grandTotalLabel}>Total Payroll — {MONTHS[month]} {year}</div>
              {payrollData.some(m => m.payType === 'hourly') && (
                <div style={s.grandTotalNote}>Hourly totals excluded pending hours tracking</div>
              )}
            </div>
            <span style={s.grandTotalAmount}>{fmt(grandTotal)}</span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Sub-components per pay type ──────────────────────────────────────────────

function PercentageDetail({ detail, payPct }) {
  const { menteeRows } = detail
  if (menteeRows.length === 0) return <p style={s.noData}>No mentees assigned.</p>

  const hasMeetings = menteeRows.some(m => m.offerings.some(o => o.completedCount > 0))
  if (!hasMeetings) return (
    <p style={s.noData}>No completed meetings linked to arrangement subscriptions this period.</p>
  )

  return (
    <>
      {menteeRows.map(mentee => (
        mentee.offerings.length === 0 ? null : (
          <div key={mentee.id} style={s.menteeBlock}>
            <div style={s.menteeName}>{mentee.name}</div>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Subscription</th>
                  <th style={{ ...s.th, ...s.thR }}>Monthly Cost</th>
                  <th style={{ ...s.th, ...s.thR }}>Meetings</th>
                  <th style={{ ...s.th, ...s.thR }}>Pro-Rated Amount</th>
                  <th style={{ ...s.th, ...s.thR }}>Payout ({payPct}%)</th>
                </tr>
              </thead>
              <tbody>
                {mentee.offerings.map(o => (
                  <tr key={o.id}>
                    <td style={s.td}>{o.offeringName}</td>
                    <td style={{ ...s.td, ...s.tdR }}>{fmt(o.cost)}</td>
                    <td style={{ ...s.td, ...s.tdR }}>
                      <span style={{ ...s.badge, ...(o.completedCount === 0 ? s.badgeGray : s.badgeGreen) }}>
                        {o.completedCount} / {o.meetings_per_period}
                      </span>
                    </td>
                    <td style={{ ...s.td, ...s.tdR }}>
                      {fmt(o.proratedAmount)}
                      {o.completedCount < o.meetings_per_period && o.completedCount > 0 && (
                        <span style={s.subNote}> ({fmt(o.cost / o.meetings_per_period)}/meeting)</span>
                      )}
                    </td>
                    <td style={{ ...s.td, ...s.tdR, fontWeight: 700 }}>{fmt(o.mentorPayout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ))}
    </>
  )
}

function MonthlyDetail({ detail, period }) {
  return (
    <div style={s.flatRow}>
      <div style={s.flatInfo}>
        <div style={s.flatLabel}>Flat monthly rate for {period}</div>
        <div style={s.flatSub}>
          {detail.menteeCount} mentee{detail.menteeCount !== 1 ? 's' : ''} assigned
          {detail.meetingsCompleted > 0 && ` · ${detail.meetingsCompleted} meeting${detail.meetingsCompleted !== 1 ? 's' : ''} completed`}
        </div>
      </div>
      <div style={s.flatAmount}>{fmt(detail.rate)}</div>
    </div>
  )
}

function PerMeetingDetail({ detail }) {
  if (detail.totalMeetings === 0) {
    return <p style={s.noData}>No completed meetings this period — payout is $0.00.</p>
  }
  return (
    <>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Mentee</th>
            <th style={{ ...s.th, ...s.thR }}>Completed Meetings</th>
            <th style={{ ...s.th, ...s.thR }}>Rate / Meeting</th>
            <th style={{ ...s.th, ...s.thR }}>Payout</th>
          </tr>
        </thead>
        <tbody>
          {detail.menteeRows.map(m => (
            <tr key={m.id}>
              <td style={s.td}>{m.name}</td>
              <td style={{ ...s.td, ...s.tdR }}>
                <span style={{ ...s.badge, ...s.badgeGreen }}>{m.meetingsCompleted}</span>
              </td>
              <td style={{ ...s.td, ...s.tdR }}>{fmt(detail.rate)}</td>
              <td style={{ ...s.td, ...s.tdR, fontWeight: 700 }}>{fmt(m.payout)}</td>
            </tr>
          ))}
        </tbody>
        {detail.menteeRows.length > 1 && (
          <tfoot>
            <tr>
              <td colSpan={3} style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: '#4a5568', paddingRight: '1rem' }}>
                Total ({detail.totalMeetings} meetings × {fmt(detail.rate)})
              </td>
              <td style={{ ...s.td, ...s.tdR, fontWeight: 700 }}>{fmt(detail.totalMeetings * detail.rate)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </>
  )
}

function HourlyDetail({ detail }) {
  return (
    <div style={{ ...s.flatRow, backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, margin: '0.5rem 1rem 0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Clock size={15} color="#d97706" />
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#92400e' }}>Hours tracking is in development</div>
          <div style={{ fontSize: '0.78rem', color: '#b45309', marginTop: '0.1rem' }}>
            Rate saved: <strong>{fmt(detail.rate)}/hour</strong>. Payout will calculate automatically once hours logging is available.
          </div>
        </div>
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#9ca3af' }}>—</div>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = {
  container: { padding: '2rem', maxWidth: '900px', margin: '0 auto' },
  pageHeader: { marginBottom: '1.5rem' },
  pageTitle: { fontSize: '1.65rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '0.2rem' },
  pageSubtitle: { color: '#9ca3af', fontSize: '0.875rem', margin: 0 },

  periodBar: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', backgroundColor: '#fff', borderRadius: '10px', padding: '0.65rem 1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1px solid #e5e7eb', width: 'fit-content' },
  periodBtn: { background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', padding: '0.25rem 0.4rem', display: 'flex', alignItems: 'center', color: '#6b7280' },
  periodLabel: { fontSize: '0.95rem', fontWeight: 600, color: '#111827', minWidth: '140px', textAlign: 'center' },

  loading: { padding: '3rem', textAlign: 'center', color: '#718096' },
  error: { backgroundColor: '#fed7d7', color: '#9b2c2c', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem' },
  empty: { textAlign: 'center', padding: '4rem 2rem', backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 10px rgba(0,0,0,0.07)' },
  emptyText: { fontSize: '1rem', fontWeight: 600, color: '#4a5568', margin: '0 0 0.4rem' },
  emptyHint: { fontSize: '0.875rem', color: '#9ca3af', margin: 0 },

  mentorCard: { backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 10px rgba(0,0,0,0.07)', marginBottom: '1.25rem', overflow: 'hidden', border: '1px solid #f3f4f6' },
  mentorHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', backgroundColor: '#f7f8ff', borderBottom: '1px solid #e8eaf6' },
  mentorHeaderLeft: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  mentorIcon: { width: 36, height: 36, borderRadius: 9, backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  mentorName: { fontWeight: 700, fontSize: '1rem', color: '#1a202c' },
  mentorMeta: { fontSize: '0.78rem', color: '#6366f1', fontWeight: 500, marginTop: 2 },
  mentorTotal: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.1rem' },
  mentorTotalLabel: { fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' },
  mentorTotalAmount: { fontSize: '1.35rem', fontWeight: 800, color: '#1a202c', letterSpacing: '-0.02em' },

  detailBody: {},
  menteeBlock: { padding: '0.85rem 1.5rem', borderBottom: '1px solid #f3f4f6' },
  menteeName: { fontWeight: 600, fontSize: '0.875rem', color: '#374151', marginBottom: '0.5rem' },
  noData: { padding: '0.85rem 1.5rem', color: '#9ca3af', fontSize: '0.875rem', fontStyle: 'italic', margin: 0 },

  flatRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1.5rem', gap: '1rem' },
  flatInfo: {},
  flatLabel: { fontWeight: 600, fontSize: '0.875rem', color: '#374151' },
  flatSub: { fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.15rem' },
  flatAmount: { fontSize: '1.25rem', fontWeight: 800, color: '#1a202c', letterSpacing: '-0.02em', flexShrink: 0 },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  th: { padding: '0.45rem 0.75rem', backgroundColor: '#f9fafb', color: '#6b7280', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', borderBottom: '1px solid #e5e7eb' },
  thR: { textAlign: 'right' },
  td: { padding: '0.6rem 0.75rem', borderBottom: '1px solid #f3f4f6', color: '#374151' },
  tdR: { textAlign: 'right' },
  badge: { display: 'inline-block', borderRadius: '4px', padding: '0.1rem 0.45rem', fontSize: '0.8rem', fontWeight: 600, border: '1px solid' },
  badgeGreen: { backgroundColor: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' },
  badgeGray: { backgroundColor: '#f9fafb', color: '#9ca3af', borderColor: '#e5e7eb' },
  subNote: { fontSize: '0.75rem', color: '#9ca3af' },

  grandTotal: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.1rem 1.5rem', backgroundColor: '#111827', borderRadius: '14px', marginTop: '0.5rem' },
  grandTotalLabel: { fontSize: '0.875rem', fontWeight: 600, color: '#d1d5db' },
  grandTotalNote: { fontSize: '0.75rem', color: '#6b7280', marginTop: '0.15rem' },
  grandTotalAmount: { fontSize: '1.6rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' },
}
