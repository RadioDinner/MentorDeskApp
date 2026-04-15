import { useState } from 'react'
import { supabase, supabaseRestCall } from '../lib/supabase'
import type { OfferingFolder } from '../types'

interface Props {
  folders: OfferingFolder[]
  setFolders: React.Dispatch<React.SetStateAction<OfferingFolder[]>>
  currentFolderId: string | null
  setCurrentFolderId: (id: string | null) => void
  folderType: 'course' | 'engagement'
  orgId: string
  /** Called when an offering is moved into/out of a folder */
  onMoveOffering: (offeringId: string, folderId: string | null) => Promise<void>
}

export default function OfferingFolderManager({
  folders, setFolders, currentFolderId, setCurrentFolderId, folderType, orgId, onMoveOffering,
}: Props) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  async function createFolder() {
    if (!newName.trim()) return
    const { data, error } = await supabaseRestCall('offering_folders', 'POST', {
      organization_id: orgId, name: newName.trim(), folder_type: folderType, order_index: folders.length,
    })
    if (error || !data?.length) return
    setFolders(prev => [...prev, data[0] as unknown as OfferingFolder])
    setNewName('')
    setCreating(false)
  }

  async function renameFolder(id: string) {
    if (!renameValue.trim()) { setRenamingId(null); return }
    await supabaseRestCall('offering_folders', 'PATCH', { name: renameValue.trim() }, `id=eq.${id}`)
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name: renameValue.trim() } : f))
    setRenamingId(null)
  }

  async function deleteFolder(id: string) {
    // Move all offerings in this folder back to root
    await supabase.from('offerings').update({ folder_id: null }).eq('folder_id', id)
    await supabaseRestCall('offering_folders', 'DELETE', {}, `id=eq.${id}`)
    setFolders(prev => prev.filter(f => f.id !== id))
    if (currentFolderId === id) setCurrentFolderId(null)
  }

  function handleDrop(e: React.DragEvent, folderId: string | null) {
    e.preventDefault()
    setDragOverId(null)
    const offeringId = e.dataTransfer.getData('offering-id')
    if (offeringId) onMoveOffering(offeringId, folderId)
  }

  const isInFolder = currentFolderId !== null
  const currentFolder = folders.find(f => f.id === currentFolderId)

  return (
    <div className="mb-4">
      {/* Breadcrumb / back */}
      {isInFolder && (
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setCurrentFolderId(null)} className="text-xs text-gray-500 hover:text-gray-700 transition-colors">&larr; All {folderType === 'course' ? 'Courses' : 'Engagements'}</button>
          <span className="text-xs text-gray-300">/</span>
          <span className="text-xs font-medium text-gray-700">{currentFolder?.name}</span>
        </div>
      )}

      {/* Folder grid (only when at root) */}
      {!isInFolder && (
        <div className="flex flex-wrap items-center gap-2 mb-1">
          {folders.map(folder => (
            <div
              key={folder.id}
              onDragOver={e => { e.preventDefault(); setDragOverId(folder.id) }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={e => handleDrop(e, folder.id)}
              className={`group relative ${dragOverId === folder.id ? 'ring-2 ring-brand/40 rounded-lg' : ''}`}
            >
              {renamingId === folder.id ? (
                <div className="flex items-center gap-1 px-2 py-1">
                  <input
                    autoFocus
                    type="text"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') renameFolder(folder.id); if (e.key === 'Escape') setRenamingId(null) }}
                    onBlur={() => renameFolder(folder.id)}
                    className="w-28 rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 outline-none focus:border-brand"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setCurrentFolderId(folder.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-all text-left"
                >
                  <svg className="w-5 h-5 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                  <span className="text-xs font-medium text-gray-700 truncate max-w-[120px]">{folder.name}</span>
                </button>
              )}
              {/* Context menu on hover */}
              {renamingId !== folder.id && (
                <div className="absolute -top-1 -right-1 hidden group-hover:flex items-center gap-0.5 bg-white border border-gray-200 rounded shadow-sm px-0.5 py-0.5 z-10">
                  <button onClick={e => { e.stopPropagation(); setRenamingId(folder.id); setRenameValue(folder.name) }}
                    className="px-1.5 py-0.5 text-[9px] text-gray-500 hover:text-brand transition-colors">Rename</button>
                  <button onClick={e => { e.stopPropagation(); deleteFolder(folder.id) }}
                    className="px-1.5 py-0.5 text-[9px] text-gray-500 hover:text-red-500 transition-colors">Delete</button>
                </div>
              )}
            </div>
          ))}

          {/* Create folder button */}
          {creating ? (
            <div className="flex items-center gap-1">
              <svg className="w-5 h-5 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
                onBlur={() => { if (newName.trim()) createFolder(); else { setCreating(false); setNewName('') } }}
                placeholder="Folder name"
                className="w-28 rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 outline-none focus:border-brand"
              />
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-200 text-xs text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Folder
            </button>
          )}
        </div>
      )}

      {/* Drop zone back to root when inside a folder */}
      {isInFolder && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOverId('root') }}
          onDragLeave={() => setDragOverId(null)}
          onDrop={e => handleDrop(e, null)}
          className={`mb-3 rounded-lg border-2 border-dashed px-4 py-2 text-center text-xs transition-colors ${
            dragOverId === 'root' ? 'border-brand/40 bg-brand-light/30 text-brand' : 'border-transparent text-transparent'
          }`}
        >
          Drop here to move to root
        </div>
      )}
    </div>
  )
}
