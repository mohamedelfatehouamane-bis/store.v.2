import { useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { io, Socket } from 'socket.io-client'

// ✅ Read env safely
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// ✅ DO NOT crash app — just log
if (!SOCKET_URL) {
  console.error('❌ Missing NEXT_PUBLIC_SOCKET_URL')
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase env vars')
}

// ✅ Create client only if env exists
const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null

type SocketInitOptions = Omit<Parameters<typeof io>[1], 'auth' | 'transports'>

export function useSocketConnection() {
  return useCallback(async (options?: SocketInitOptions): Promise<Socket | null> => {
    
    // ✅ Safety checks
    if (!SOCKET_URL) {
      console.error('[Socket] ❌ No SOCKET_URL')
      return null
    }

    if (!supabase) {
      console.error('[Socket] ❌ Supabase not initialized')
      return null
    }

    const { data, error } = await supabase.auth.getSession()

    if (error) {
      console.error('[Socket] ✗ Failed to load session', error)
      return null
    }

    const token = data.session?.access_token

    if (!token) {
      console.warn('[Socket] ✗ No session, skipping socket')
      return null
    }

    console.log('[Socket] ✓ Session OK')

    const socket = io(SOCKET_URL, {
      ...options,
      auth: { token },
      transports: ['websocket'],
    })

    socket.on('connect', () => {
      console.log('🔥 Socket CONNECTED')
    })

    socket.on('connect_error', (err) => {
      console.error('[Socket] ✗ connect_error', err)
    })

    return socket
  }, [])
}
