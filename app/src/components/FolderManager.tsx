import { useState } from 'react'
import { supabase, supabaseRestCall } from '../lib/supabase'

/**
 * Generic folder sidebar/header for any entity type that has a
 * `folder_id` foreign key on its item table and a dedicated folders
 * table with the shape { id, organization_id, name, order_index,
 * created_at }.
 *
 * Currently driving HabitsPage and CanvasesPage. OfferingFolderManager
 * (migration 965) is still a separate component because it uses a
 * shared `offering_folders` table with a `folder_type` discriminator
 * column; unifying that would require either adding the discriminator
 * here or splitting offering_folders into course_folders +
 * engagement_folders. Not worth the churn right now.
 */

export interface FolderLike {
  id: string
  name: string
  order_index: number
}

interface Props<F extends FolderLike> {
  folders: F[]
  setFolders: React.Dispatch<React.SetStateAction<F[]>>
  currentFolderId: string | null
  setCurrentFolderId: (id: string | null) => void
  orgId: string
  /** Supabase table name for the folders (e.g. 'habit_folders'). */
  folderTable: string
  /** Supabase table name for the items themselves (e.g. 'habits').
   *  Used on delete-folder to bulk-null folder_id on the orphaned items. */
  itemTable: string
  /** Key used to transport item IDs via the HTML5 drag-and-drop
   *  dataTransfer API (e.g. 'habit-id'). Grid/list rows set this on
   *  drag start; FolderManager reads it on drop. */
  dragKey: string
  /** Breadcrumb label for the "all items" root (e.g. "All Habits"). */
  rootLabel: string
  /** Called when an item gets dropped onto a folder or the root drop zone. */
  onMoveItem: (itemId: string, folderId: string | null) => Promise<void>
}

export default function FolderManager<F extends FolderLike>({
  folders,
  setFolders,
  currentFolderId,
  setCurrentFolderId,
  orgId,
  folderTable,
  itemTable,
  dragKey,
  rootLabel,
  onMoveItem,
}: Props<F>) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  async function createFolder() {
    if (!newName.trim()) return
    const { data, error } = await supabaseRestCall(folderTable, 'POST', {
      organization_id: orgId,
      name: newName.trim(),
      order_index: folders.length,
    })
    if (error || !data?.length) return
    setFolders(prev => [...prev, data[0] as unknown as F])
    setNewName('')
    setCreating(false)
  }

  async function renameFolder(id: string) {
    if (!renameValue.trim()) { setRenamingId(null); return }
    await supabaseRestCall(folderTable, 'PATCH', { name: renameValue.trim() }, `id=eq.${id}`)
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name: renameValue.trim() } : f))
    setRenamingId(null)
  }

  async function deleteFolder(id: string) {
    // Move any items still in this folder back to the root. ON DELETE
    // SET NULL on the FK would also handle it, but doing it explicitly
    // before the folder DELETE keeps the UI state in sync without a
    // refetch — and matches the OfferingFolderManager pattern.
    await supabase.from(itemTable).update({ folder_id: null }).eq('folder_id', id)
    await supabaseRestCall(folderTable, 'DELETE', {}, `id=eq.${id}`)
    setFolders(prev => prev.filter(f => f.id !== id))
    if (currentFolderId === id) setCurrentFolderId(null)
  }

  function handleDrop(e: React.DragEvent, folderId: string | null) {
    e.preventDefault()
    setDragOverId(null)
    const itemId = e.dataTransfer.getData(dragKey)
    if (itemId) onMoveItem(itemId, folderId)
  }

  const isInFolder = currentFolderId !== null
  const currentFolder = folders.find(f => f.id === currentFolderId)

  return (
    <div className="mb-4">
      {/* Breadcrumb / back */}
      {isInFolder && (
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setCurrentFolderId(null)}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            &larr; {rootLabel}
          </button>
          <span className="text-xs text-gray-300">/</span>
          <span className="text-xs font-medium text-gray-700">{currentFolder?.name}</span>
        </div>
      )}

      {/* Folder row (only shown at root) */}
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
                    onKeyDown={e => {
                      if (e.key === 'Enter') renameFolder(folder.id)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
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
              {renamingId !== folder.id && (
                <div className="absolute -top-1 -right-1 hidden group-hover:flex items-center gap-0.5 bg-white border border-gray-200 rounded shadow-sm px-0.5 py-0.5 z-10">
                  <button
                    onClick={e => { e.stopPropagation(); setRenamingId(folder.id); setRenameValue(folder.name) }}
                    className="px-1.5 py-0.5 text-[9px] text-gray-500 hover:text-brand transition-colors"
                  >
                    Rename
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteFolder(folder.id) }}
                    className="px-1.5 py-0.5 text-[9px] text-gray-500 hover:text-red-500 transition-colors"
                  >
                    Delete
                  </button>
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
                onKeyDown={e => {
                  if (e.key === 'Enter') createFolder()
                  if (e.key === 'Escape') { setCreating(false); setNewName('') }
                }}
                onBlur={() => {
                  if (newName.trim()) createFolder()
                  else { setCreating(false); setNewName('') }
                }}
                placeholder="Folder name"
                className="w-28 rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 outline-none focus:border-brand"
              />
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-200 text-xs text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
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
