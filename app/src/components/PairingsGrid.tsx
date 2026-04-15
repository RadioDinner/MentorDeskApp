import { useState, useRef, useCallback } from 'react'
import type { PairingStatus, FlowStep } from '../types'

interface MentorOption { id: string; first_name: string; last_name: string; max_active_mentees: number | null }
interface MenteeRow { id: string; first_name: string; last_name: string; email: string; flow_step_id: string | null }
interface OfferingOption { id: string; name: string; type: 'course' | 'engagement' }
interface PairingRow {
  id: string; status: PairingStatus; mentor_id: string; mentee_id: string; offering_id: string | null
  mentor: MentorOption
  mentee: MenteeRow
  offering?: OfferingOption | null
}

interface Props {
  pairings: PairingRow[]
  mentors: MentorOption[]
  mentees: MenteeRow[]
  offerings: OfferingOption[]
  flowSteps: FlowStep[]
  canEdit?: boolean
  onChangeMentor: (pairingId: string, newMentorId: string) => void
  onChangeStatus: (pairingId: string, newStatus: PairingStatus) => void
}

interface ColumnDef {
  id: string
  label: string
  width: number
  minWidth: number
  getValue: (row: PairingRow, helpers: Helpers) => string
  render?: (row: PairingRow, helpers: Helpers) => React.ReactNode
  sortable?: boolean
}

interface Helpers {
  flowStepName: (id: string | null) => string
  mentors: MentorOption[]
  canEdit: boolean
  onChangeMentor: (pairingId: string, newMentorId: string) => void
  onChangeStatus: (pairingId: string, newStatus: PairingStatus) => void
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  {
    id: 'mentee_name',
    label: 'Mentee',
    width: 200,
    minWidth: 140,
    getValue: (r) => `${r.mentee.first_name} ${r.mentee.last_name}`,
    render: (r) => (
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-green-50 flex items-center justify-center text-[9px] font-bold text-green-600 shrink-0">
          {r.mentee.first_name[0]}{r.mentee.last_name[0]}
        </span>
        <span className="truncate font-medium text-gray-900">{r.mentee.first_name} {r.mentee.last_name}</span>
      </div>
    ),
    sortable: true,
  },
  {
    id: 'mentee_email',
    label: 'Email',
    width: 220,
    minWidth: 150,
    getValue: (r) => r.mentee.email,
    render: (r) => <span className="truncate text-gray-600">{r.mentee.email}</span>,
    sortable: true,
  },
  {
    id: 'mentor_name',
    label: 'Mentor',
    width: 200,
    minWidth: 140,
    getValue: (r) => `${r.mentor.first_name} ${r.mentor.last_name}`,
    render: (r, h) => h.canEdit ? (
      <select
        value={r.mentor_id}
        onChange={e => h.onChangeMentor(r.id, e.target.value)}
        className="w-full bg-transparent border-0 text-xs text-gray-700 outline-none cursor-pointer py-0 px-0 focus:ring-0"
      >
        {h.mentors.map(m => (
          <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
        ))}
      </select>
    ) : (
      <span className="text-xs text-gray-700">{r.mentor.first_name} {r.mentor.last_name}</span>
    ),
    sortable: true,
  },
  {
    id: 'status',
    label: 'Status',
    width: 160,
    minWidth: 120,
    getValue: (r, h) => h.flowStepName(r.mentee.flow_step_id),
    render: (r, h) => {
      const name = h.flowStepName(r.mentee.flow_step_id)
      return name
        ? <span className="text-[11px] px-2 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">{name}</span>
        : <span className="text-gray-300 text-xs">—</span>
    },
    sortable: true,
  },
  {
    id: 'offering',
    label: 'Offering',
    width: 180,
    minWidth: 120,
    getValue: (r) => r.offering?.name ?? '',
    render: (r) => {
      if (!r.offering) return <span className="text-gray-300">General</span>
      const isEngagement = r.offering.type === 'engagement'
      return (
        <span className={`text-[11px] px-2 py-0.5 rounded font-medium truncate inline-block max-w-full ${
          isEngagement ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
        }`}>
          {r.offering.name}
        </span>
      )
    },
    sortable: true,
  },
]

type SortDir = 'asc' | 'desc' | null

export default function PairingsGrid({ pairings, mentors, mentees: _mentees, offerings: _offerings, flowSteps, canEdit = false, onChangeMentor, onChangeStatus }: Props) {
  const [columns, setColumns] = useState(DEFAULT_COLUMNS)
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [search, setSearch] = useState('')
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null)
  const [colWidths, setColWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(DEFAULT_COLUMNS.map(c => [c.id, c.width]))
  )

  // Drag-and-drop column reorder state
  const dragColRef = useRef<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  // Column resize state
  const resizeRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null)

  const helpers: Helpers = {
    flowStepName: (id) => {
      if (!id) return ''
      return flowSteps.find(s => s.id === id)?.name ?? ''
    },
    mentors,
    canEdit,
    onChangeMentor,
    onChangeStatus,
  }

  // Sort
  function handleSort(colId: string) {
    if (sortCol === colId) {
      if (sortDir === 'asc') setSortDir('desc')
      else if (sortDir === 'desc') { setSortCol(null); setSortDir(null) }
    } else {
      setSortCol(colId)
      setSortDir('asc')
    }
  }

  // Compute distinct values per column (for filter dropdowns)
  function getDistinctValues(colId: string): string[] {
    const col = columns.find(c => c.id === colId)
    if (!col) return []
    const vals = new Set<string>()
    for (const r of pairings) {
      const v = col.getValue(r, helpers)
      if (v) vals.add(v)
    }
    return Array.from(vals).sort()
  }

  const activeFilterCount = Object.values(colFilters).filter(v => v).length

  // Filter + sort rows
  let rows = [...pairings]
  if (search.trim()) {
    const q = search.toLowerCase()
    rows = rows.filter(r =>
      `${r.mentee.first_name} ${r.mentee.last_name}`.toLowerCase().includes(q) ||
      r.mentee.email.toLowerCase().includes(q) ||
      `${r.mentor.first_name} ${r.mentor.last_name}`.toLowerCase().includes(q) ||
      r.status.includes(q) ||
      (r.offering?.name?.toLowerCase().includes(q) ?? false)
    )
  }

  // Apply per-column filters
  for (const [colId, filterVal] of Object.entries(colFilters)) {
    if (!filterVal) continue
    const col = columns.find(c => c.id === colId)
    if (!col) continue
    rows = rows.filter(r => col.getValue(r, helpers) === filterVal)
  }
  if (sortCol && sortDir) {
    const col = columns.find(c => c.id === sortCol)
    if (col) {
      rows.sort((a, b) => {
        const av = col.getValue(a, helpers).toLowerCase()
        const bv = col.getValue(b, helpers).toLowerCase()
        const cmp = av.localeCompare(bv)
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
  }

  // Column drag handlers
  const onDragStart = useCallback((colId: string) => {
    dragColRef.current = colId
  }, [])

  const onDragOver = useCallback((e: React.DragEvent, colId: string) => {
    e.preventDefault()
    if (dragColRef.current && dragColRef.current !== colId) {
      setDragOverCol(colId)
    }
  }, [])

  const onDrop = useCallback((targetColId: string) => {
    const sourceId = dragColRef.current
    if (!sourceId || sourceId === targetColId) {
      dragColRef.current = null
      setDragOverCol(null)
      return
    }
    setColumns(prev => {
      const arr = [...prev]
      const fromIdx = arr.findIndex(c => c.id === sourceId)
      const toIdx = arr.findIndex(c => c.id === targetColId)
      if (fromIdx < 0 || toIdx < 0) return prev
      const [moved] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, moved)
      return arr
    })
    dragColRef.current = null
    setDragOverCol(null)
  }, [])

  const onDragEnd = useCallback(() => {
    dragColRef.current = null
    setDragOverCol(null)
  }, [])

  // Column resize handlers
  const onResizeStart = useCallback((e: React.MouseEvent, colId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = colWidths[colId] ?? 150

    resizeRef.current = { colId, startX, startWidth }

    function onMouseMove(ev: MouseEvent) {
      if (!resizeRef.current) return
      const diff = ev.clientX - resizeRef.current.startX
      const col = DEFAULT_COLUMNS.find(c => c.id === resizeRef.current!.colId)
      const min = col?.minWidth ?? 80
      const newWidth = Math.max(min, resizeRef.current.startWidth + diff)
      setColWidths(prev => ({ ...prev, [resizeRef.current!.colId]: newWidth }))
    }

    function onMouseUp() {
      resizeRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [colWidths])

  const totalWidth = columns.reduce((sum, c) => sum + (colWidths[c.id] ?? c.width), 0)

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search pairings..."
            className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 transition placeholder-gray-400 w-64"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>{rows.length} pairing{rows.length !== 1 ? 's' : ''}</span>
          {activeFilterCount > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => setColFilters({})}
                className="text-xs text-brand hover:text-brand-hover transition-colors font-medium"
              >
                Clear {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
              </button>
            </>
          )}
          <span className="text-gray-300">|</span>
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
            </svg>
            Drag columns to reorder
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <div style={{ minWidth: totalWidth }}>

            {/* Header */}
            <div className="flex bg-gray-50 border-b border-gray-200 select-none">
              {columns.map((col) => {
                const w = colWidths[col.id] ?? col.width
                const isSorted = sortCol === col.id
                const isDropTarget = dragOverCol === col.id

                return (
                  <div
                    key={col.id}
                    className={`relative flex items-center shrink-0 transition-colors ${
                      isDropTarget ? 'bg-brand-light/60' : ''
                    }`}
                    style={{ width: w }}
                    draggable
                    onDragStart={() => onDragStart(col.id)}
                    onDragOver={e => onDragOver(e, col.id)}
                    onDrop={() => onDrop(col.id)}
                    onDragEnd={onDragEnd}
                  >
                    <div className="flex-1 flex items-center px-3 py-2.5 cursor-grab active:cursor-grabbing">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-left flex-1"
                        onClick={() => col.sortable && handleSort(col.id)}
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                          {col.label}
                        </span>
                        {col.sortable && (
                          <span className={`flex flex-col text-[8px] leading-none ${isSorted ? 'text-brand' : 'text-gray-300'}`}>
                            <span className={isSorted && sortDir === 'asc' ? 'text-brand' : ''}>&#9650;</span>
                            <span className={isSorted && sortDir === 'desc' ? 'text-brand' : ''}>&#9660;</span>
                          </span>
                        )}
                      </button>
                      {/* Filter button */}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setActiveFilterCol(activeFilterCol === col.id ? null : col.id) }}
                        className={`shrink-0 p-0.5 rounded transition-colors ${colFilters[col.id] ? 'text-brand' : 'text-gray-300 hover:text-gray-500'}`}
                        title={`Filter by ${col.label}`}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                      </button>
                    </div>

                    {/* Filter dropdown */}
                    {activeFilterCol === col.id && (
                      <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg min-w-[160px] py-1">
                        <button
                          onClick={() => { setColFilters(prev => { const next = { ...prev }; delete next[col.id]; return next }); setActiveFilterCol(null) }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${!colFilters[col.id] ? 'text-brand font-medium' : 'text-gray-600'}`}
                        >
                          All
                        </button>
                        {getDistinctValues(col.id).map(val => (
                          <button
                            key={val}
                            onClick={() => { setColFilters(prev => ({ ...prev, [col.id]: val })); setActiveFilterCol(null) }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors truncate ${colFilters[col.id] === val ? 'text-brand font-medium bg-brand-light' : 'text-gray-700'}`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Resize handle */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand/40 transition-colors z-10"
                      onMouseDown={e => onResizeStart(e, col.id)}
                    />

                    {/* Drop indicator */}
                    {isDropTarget && (
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-brand" />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Rows */}
            {rows.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-gray-400">
                  {search ? `No pairings match "${search}"` : 'No pairings yet.'}
                </p>
              </div>
            ) : (
              <div>
                {rows.map((row, i) => (
                  <div
                    key={row.id}
                    className={`flex items-center border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors ${
                      i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                    }`}
                  >
                    {columns.map(col => {
                      const w = colWidths[col.id] ?? col.width
                      return (
                        <div
                          key={col.id}
                          className="shrink-0 px-3 py-2.5 text-xs overflow-hidden"
                          style={{ width: w }}
                        >
                          {col.render ? col.render(row, helpers) : (
                            <span className="truncate text-gray-700">{col.getValue(row, helpers)}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-200">
          <span className="text-[11px] text-gray-400">{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
          <span className="text-[11px] text-gray-400">{columns.length} columns</span>
        </div>
      </div>
    </div>
  )
}
