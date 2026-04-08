import { supabase } from '../supabaseClient'

/**
 * Generates recurring monthly invoices for all active mentee_offerings
 * that have recurring billing and whose last invoice is 30+ days old.
 * Runs once per session on login.
 */
export async function runRecurringBilling(organizationId) {
  if (!organizationId) return

  try {
    // Get all active mentee_offerings with their offering details
    const { data: assignments, error: assignErr } = await supabase
      .from('mentee_offerings')
      .select('id, mentee_id, offering_id, status, offering:offerings(id, name, cost, billing_type, invoice_delay_days)')
      .eq('status', 'active')

    if (assignErr || !assignments || assignments.length === 0) return

    // Filter to recurring offerings with a cost
    const recurring = assignments.filter(a =>
      a.offering?.billing_type === 'recurring' &&
      a.offering?.cost &&
      parseFloat(a.offering.cost) > 0
    )
    if (recurring.length === 0) return

    // Get all existing invoices for these mentee+offering combos
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, mentee_id, offering_id, due_date, status, created_at')
      .order('created_at', { ascending: false })

    // Build a map of latest invoice date per mentee+offering
    const latestInvoiceMap = {}
    for (const inv of (invoices || [])) {
      const key = `${inv.mentee_id}:${inv.offering_id}`
      if (!latestInvoiceMap[key]) {
        latestInvoiceMap[key] = new Date(inv.created_at)
      }
    }

    // Check for open (pending/overdue) invoices per mentee+offering
    const openInvoiceKeys = new Set()
    for (const inv of (invoices || [])) {
      if (inv.status === 'pending' || inv.status === 'overdue') {
        openInvoiceKeys.add(`${inv.mentee_id}:${inv.offering_id}`)
      }
    }

    // Get billing settings
    const { data: settingsData } = await supabase
      .from('settings')
      .select('key, value')
      .eq('organization_id', organizationId)
      .in('key', ['payment_terms', 'invoice_delay_days', 'invoice_default_notes'])
    const getSetting = key => settingsData?.find(s => s.key === key)?.value || ''
    const companyDelayDays = parseInt(getSetting('invoice_delay_days')) || 0
    const paymentTerms = getSetting('payment_terms') || 'due_on_receipt'
    const defaultNotes = getSetting('invoice_default_notes') || null
    const termsDays = { due_on_receipt: 0, net_15: 15, net_30: 30, net_45: 45, net_60: 60 }

    const now = new Date()
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const newInvoices = []
    for (const a of recurring) {
      const key = `${a.mentee_id}:${a.offering_id}`

      // Skip if there's already an open (unpaid) invoice
      if (openInvoiceKeys.has(key)) continue

      // Skip if latest invoice was less than 30 days ago
      const lastDate = latestInvoiceMap[key]
      if (lastDate && lastDate > thirtyDaysAgo) continue

      // Calculate due date
      const delayDays = a.offering.invoice_delay_days != null ? a.offering.invoice_delay_days : companyDelayDays
      const issueDate = new Date(now)
      issueDate.setDate(issueDate.getDate() + delayDays)
      const dueDate = new Date(issueDate)
      dueDate.setDate(dueDate.getDate() + (termsDays[paymentTerms] || 0))

      newInvoices.push({
        mentee_id: a.mentee_id,
        offering_id: a.offering_id,
        amount: parseFloat(a.offering.cost),
        due_date: dueDate.toISOString().split('T')[0],
        description: `${a.offering.name} (Monthly)`,
        notes: defaultNotes,
        organization_id: organizationId,
        issued_at: now.toISOString(),
      })
    }

    if (newInvoices.length > 0) {
      await supabase.from('invoices').insert(newInvoices)
      console.log(`Recurring billing: generated ${newInvoices.length} invoice(s)`)
    }
  } catch (err) {
    console.error('Recurring billing check failed:', err)
  }
}
