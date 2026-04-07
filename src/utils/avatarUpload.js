import { supabase } from '../supabaseClient'

/**
 * Upload an avatar file to Supabase Storage, cleaning up any old files
 * for the same entity and returning a cache-busted public URL.
 *
 * @param {File} file - The image file to upload
 * @param {string} folder - Storage folder (e.g. 'mentees', 'mentors', 'staff', 'assistant_mentors')
 * @param {string} entityId - The entity's UUID
 * @returns {{ publicUrl: string } | { error: string }}
 */
export async function uploadAvatar(file, folder, entityId) {
  const ext = file.name.split('.').pop().toLowerCase()
  const path = `${folder}/${entityId}.${ext}`

  // Try to clean up old avatar files with different extensions (best-effort)
  try {
    const { data: existing } = await supabase.storage.from('avatars').list(folder, {
      search: entityId,
    })
    if (existing?.length) {
      const toRemove = existing
        .filter(f => f.name.startsWith(entityId) && f.name !== `${entityId}.${ext}`)
        .map(f => `${folder}/${f.name}`)
      if (toRemove.length) {
        await supabase.storage.from('avatars').remove(toRemove)
      }
    }
  } catch {
    // Cleanup is best-effort; proceed with upload regardless
  }

  // Upload the new file with explicit content type
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, {
      upsert: true,
      contentType: file.type || 'image/jpeg',
    })

  if (uploadError) {
    return { error: uploadError.message }
  }

  // Get public URL with cache-busting parameter
  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
  return { publicUrl: `${publicUrl}?t=${Date.now()}` }
}
