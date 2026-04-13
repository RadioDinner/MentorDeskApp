import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase, withTimeout } from '../lib/supabase'
import { formatMoney, formatDate, formatDateShort } from '../lib/format'
import { Button, Badge, toneForStatus } from '../components/ui'
import { useToast } from '../context/ToastContext'

interface Invoice {
  id: string
  invoice_number: string | null
  status: string
  amount_cents: number
  currency: string
  due_date: string | null
  paid_at: string | null
  notes: string | null
  created_at: string
}

interface PaymentMethod {
  card_brand: string
  card_last4: string
  exp_month: number
  exp_year: number
}

export default function MenteeBillingPage() {
  const { menteeProfile } = useAuth()
  const toast = useToast()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'invoices' | 'payment'>('invoices')

  // Payment method form state
  const [cardName, setCardName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvc, setCardCvc] = useState('')
  const [savedPayment, setSavedPayment] = useState<PaymentMethod | null>(null)
  const [savingPayment, setSavingPayment] = useState(false)

  useEffect(() => {
    if (!menteeProfile) { setLoading(false); return }

    async function fetchInvoices() {
      setLoading(true)
      try {
        const { data } = await withTimeout(
          supabase
            .from('invoices')
            .select('*')
            .eq('mentee_id', menteeProfile!.id)
            .order('created_at', { ascending: false }),
          10000,
          'fetchMenteeInvoices',
        )
        if (data) setInvoices(data as Invoice[])

        // Load saved payment method from mentee metadata
        const { data: menteeData } = await supabase
          .from('mentees')
          .select('payment_method')
          .eq('id', menteeProfile!.id)
          .single()
        if (menteeData?.payment_method) {
          setSavedPayment(menteeData.payment_method as PaymentMethod)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchInvoices()
  }, [menteeProfile?.id])

  async function handleSavePayment() {
    if (!menteeProfile) return
    if (!cardNumber.trim() || !cardExpiry.trim() || !cardCvc.trim()) {
      toast.error('Please fill in all card fields.')
      return
    }

    setSavingPayment(true)

    // In production, this would go to Stripe/payment processor.
    // For now, we store a masked version in the mentee record.
    const last4 = cardNumber.replace(/\s/g, '').slice(-4)
    const [expMonth, expYear] = cardExpiry.split('/').map(s => parseInt(s.trim()))
    const paymentMethod: PaymentMethod = {
      card_brand: detectCardBrand(cardNumber),
      card_last4: last4,
      exp_month: expMonth || 0,
      exp_year: expYear ? (expYear < 100 ? 2000 + expYear : expYear) : 0,
    }

    try {
      const { error } = await supabase
        .from('mentees')
        .update({ payment_method: paymentMethod })
        .eq('id', menteeProfile.id)

      if (error) {
        toast.error(error.message)
      } else {
        setSavedPayment(paymentMethod)
        setCardNumber('')
        setCardExpiry('')
        setCardCvc('')
        setCardName('')
        toast.success('Payment method saved.')
      }
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save')
    } finally {
      setSavingPayment(false)
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>

  const unpaidInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
  const totalOwed = unpaidInvoices.reduce((sum, i) => sum + i.amount_cents, 0)

  const inputClass = 'w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition'

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Billing</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your payment method and view invoices</p>
      </div>

      {/* Balance summary */}
      {totalOwed > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-800">Outstanding balance</p>
              <p className="text-xs text-amber-600 mt-0.5">{unpaidInvoices.length} unpaid invoice{unpaidInvoices.length !== 1 ? 's' : ''}</p>
            </div>
            <p className="text-lg font-bold text-amber-800">{formatMoney(totalOwed, 'USD')}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {(['invoices', 'payment'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px capitalize ${
              activeTab === tab
                ? 'border-brand text-brand'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab === 'invoices' ? 'Invoices' : 'Payment Method'}
          </button>
        ))}
      </div>

      {/* Invoices tab */}
      {activeTab === 'invoices' && (
        <div>
          {invoices.length === 0 ? (
            <div className="bg-white rounded-md border border-gray-200/80 px-6 py-12 text-center">
              <p className="text-sm text-gray-500">No invoices yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-md border border-gray-200/80 divide-y divide-gray-100">
              {invoices.map(inv => (
                <div key={inv.id} className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          {inv.invoice_number ?? 'Invoice'}
                        </p>
                        <Badge tone={toneForStatus(inv.status)}>
                          {inv.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-xs text-gray-500">
                          {formatDate(inv.created_at)}
                        </p>
                        {inv.due_date && (
                          <p className="text-xs text-gray-400">
                            Due {formatDateShort(inv.due_date)}
                          </p>
                        )}
                        {inv.paid_at && (
                          <p className="text-xs text-green-600">
                            Paid {formatDateShort(inv.paid_at)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className={`text-sm font-semibold ${inv.status === 'paid' ? 'text-gray-400' : 'text-gray-900'}`}>
                        {formatMoney(inv.amount_cents, inv.currency)}
                      </p>
                      <a
                        href={`/invoices/${inv.id}/print`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                        title="View / Print / Save as PDF"
                      >
                        View PDF
                      </a>
                    </div>
                  </div>
                  {inv.notes && (
                    <p className="text-xs text-gray-400 mt-2">{inv.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payment method tab */}
      {activeTab === 'payment' && (
        <div className="space-y-4">
          {/* Current payment method */}
          {savedPayment && (
            <div className="bg-white rounded-md border border-gray-200/80 px-5 py-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Current payment method</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-7 rounded bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                  {savedPayment.card_brand.toUpperCase().slice(0, 4)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {savedPayment.card_brand} ending in {savedPayment.card_last4}
                  </p>
                  <p className="text-xs text-gray-500">
                    Expires {String(savedPayment.exp_month).padStart(2, '0')}/{savedPayment.exp_year}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Update / add payment method */}
          <div className="bg-white rounded-md border border-gray-200/80 px-5 py-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              {savedPayment ? 'Update payment method' : 'Add payment method'}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name on card</label>
                <input
                  type="text"
                  value={cardName}
                  onChange={e => setCardName(e.target.value)}
                  placeholder="Jane Smith"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Card number</label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                  placeholder="4242 4242 4242 4242"
                  maxLength={19}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Expiry</label>
                  <input
                    type="text"
                    value={cardExpiry}
                    onChange={e => setCardExpiry(formatExpiry(e.target.value))}
                    placeholder="MM/YY"
                    maxLength={5}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">CVC</label>
                  <input
                    type="text"
                    value={cardCvc}
                    onChange={e => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="123"
                    maxLength={4}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4">
              <Button onClick={handleSavePayment} disabled={savingPayment}>
                {savingPayment ? 'Saving...' : savedPayment ? 'Update Payment Method' : 'Save Payment Method'}
              </Button>
            </div>

            <p className="text-[10px] text-gray-400 mt-3">
              Your payment information is stored securely. In production, card data is handled by a PCI-compliant payment processor.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 16)
  return digits.replace(/(.{4})/g, '$1 ').trim()
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2)
  return digits
}

function detectCardBrand(number: string): string {
  const d = number.replace(/\D/g, '')
  if (d.startsWith('4')) return 'Visa'
  if (/^5[1-5]/.test(d) || /^2[2-7]/.test(d)) return 'Mastercard'
  if (d.startsWith('3') && (d[1] === '4' || d[1] === '7')) return 'Amex'
  if (d.startsWith('6011') || d.startsWith('65')) return 'Discover'
  return 'Card'
}
