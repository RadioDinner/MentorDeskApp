import type { CancellationPolicy, CancelWindowUnit, CancelOutcome } from '../types'

interface Props {
  policy: CancellationPolicy
  onChange: (policy: CancellationPolicy) => void
}

const WINDOW_UNITS: { value: CancelWindowUnit; label: string }[] = [
  { value: 'hours', label: 'hours' },
  { value: 'days', label: 'days' },
]

const OUTCOMES: { value: CancelOutcome; label: string }[] = [
  { value: 'keep_credit', label: 'Keep credit (can reschedule)' },
  { value: 'lose_credit', label: 'Lose credit (no refund)' },
]

export default function CancellationPolicyEditor({ policy, onChange }: Props) {
  const selectClass =
    'rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition bg-white'

  return (
    <div className="space-y-4">
      {/* Cancellation window */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Cancellation window
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            value={policy.cancel_window_value}
            onChange={e => onChange({ ...policy, cancel_window_value: parseInt(e.target.value) || 0 })}
            className="w-20 rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
          />
          <select
            value={policy.cancel_window_unit}
            onChange={e => onChange({ ...policy, cancel_window_unit: e.target.value as CancelWindowUnit })}
            className={selectClass}
          >
            {WINDOW_UNITS.map(u => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">before the appointment</span>
        </div>
      </div>

      {/* Cancelled within window */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          If cancelled within the window
        </label>
        <select
          value={policy.cancelled_in_window}
          onChange={e => onChange({ ...policy, cancelled_in_window: e.target.value as CancelOutcome })}
          className={selectClass + ' w-full'}
        >
          {OUTCOMES.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          What happens when the mentee cancels with enough notice.
        </p>
      </div>

      {/* Cancelled outside window (late cancel) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          If cancelled after the window (late cancel)
        </label>
        <select
          value={policy.cancelled_outside_window}
          onChange={e => onChange({ ...policy, cancelled_outside_window: e.target.value as CancelOutcome })}
          className={selectClass + ' w-full'}
        >
          {OUTCOMES.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          What happens when the mentee cancels too close to the appointment time.
        </p>
      </div>

      {/* No-show */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          If no-show
        </label>
        <select
          value={policy.no_show}
          onChange={e => onChange({ ...policy, no_show: e.target.value as CancelOutcome })}
          className={selectClass + ' w-full'}
        >
          {OUTCOMES.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          What happens when the mentee misses the appointment without cancelling.
        </p>
      </div>
    </div>
  )
}

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  cancel_window_value: 24,
  cancel_window_unit: 'hours',
  cancelled_in_window: 'keep_credit',
  cancelled_outside_window: 'lose_credit',
  no_show: 'lose_credit',
}
