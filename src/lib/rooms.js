import { supabase } from './supabase.js'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I,O,0,1

export function generateRoomCode() {
  let code = 'PARTY-'
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

/**
 * Create a room and insert the host as the first participant.
 * Returns the new room row.
 */
export async function createRoom({ name, user, displayName, avatar }) {
  if (!user) throw new Error('Not signed in.')
  if (!name?.trim()) throw new Error('Room name is required.')

  // try a few times in the (extremely unlikely) case of code collision
  let attempt = 0
  let roomRow = null
  let lastErr = null
  while (attempt < 5 && !roomRow) {
    attempt++
    const code = generateRoomCode()
    const { data, error } = await supabase
      .from('rooms')
      .insert({
        code,
        name: name.trim(),
        host_id: user.id,
        video_url: '',
      })
      .select()
      .single()
    if (!error) {
      roomRow = data
      break
    }
    lastErr = error
    // 23505 = unique violation -> retry with new code
    if (error.code !== '23505') break
  }
  if (!roomRow) throw lastErr || new Error('Could not create room.')

  const { error: userErr } = await supabase.from('users').insert({
    id: user.id,
    room_id: roomRow.id,
    display_name: displayName,
    avatar_emoji: avatar,
  })
  if (userErr && userErr.code !== '23505') throw userErr

  return roomRow
}

/**
 * Look up a room by its code and join it as a participant.
 * Returns the room row, or throws "Room not found".
 */
export async function joinRoomByCode({ code, user, displayName, avatar }) {
  if (!user) throw new Error('Not signed in.')
  if (!code?.trim()) throw new Error('Enter a room code.')

  const normalized = code.trim().toUpperCase()
  const { data: room, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', normalized)
    .maybeSingle()
  if (error) throw error
  if (!room) throw new Error('Room not found')

  // Insert participant. Ignore duplicate inserts on rejoin.
  const { error: userErr } = await supabase.from('users').insert({
    id: user.id,
    room_id: room.id,
    display_name: displayName,
    avatar_emoji: avatar,
  })
  if (userErr && userErr.code !== '23505') {
    // Don't block joining if RLS-permitted insert just collided.
    console.warn('[joinRoom] users insert:', userErr)
  }

  return room
}
