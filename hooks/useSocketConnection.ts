import { useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { io, Socket } from 'socket.io-client'

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SOCKET_URL) {
  throw new Error('Missing NEXT_PUBLIC_SOCKET_URL in .env.local. Add NEXT_PUBLIC_SOCKET_URL and restart the dev server.')
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

type SocketInitOptions = Omit<Parameters<typeof io>[1], 'auth' | 'transports'>

export function useSocketConnection() {
  return useCallback(async (options?: SocketInitOptions): Promise<Socket | null> => {
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      console.error('[Socket] ✗ Failed to load Supabase session', error)
      return null
    }

    const token = data.session?.access_token
    if (!token) {
      console.warn('[Socket] ✗ No Supabase session yet, skipping socket connection')
      return null
    }

    console.log('[Socket] ✓ Valid Supabase session found')

    const socket = io(SOCKET_URL, {
      ...options,
      auth: { token },
      transports: ['websocket'],
    })

    socket.on('connect', () => {
      console.log('🔥 CONNECTED')
    })

    socket.on('connect_error', (connectError) => {
      console.error('[Socket] ✗ connect_error', connectError)
    })

    return socket
  }, [])
}
