
import { NextRequest } from 'next/server'
import { supabase } from '@/lib/db'

const MAX_REQUESTS_PER_MINUTE = 5
const WINDOW_DURATION_MS = 60 * 1000 // 1 minute

/**
 * Extract client IP address from request headers
 * Handles proxies (X-Forwarded-For, CF-Connecting-IP, etc.)
 */
function getClientIP(request: NextRequest): string {
  // Try common proxy headers first
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const cfConnecting = request.headers.get('cf-connecting-ip')
  if (cfConnecting) {
    return cfConnecting
  }

  const xRealIp = request.headers.get('x-real-ip')
  if (xRealIp) {
    return xRealIp
  }

  // Fallback to default
  return '127.0.0.1'
}

/**
 * Check if request should be rate limited
 * Returns { allowed: boolean, remaining: number, resetAt: Date }
 */
export async function checkRateLimit(
  request: NextRequest,
  endpoint: string = '/api/auth/register'
): Promise<{
  allowed: boolean
  remaining: number
  resetAt: Date
  retryAfter?: number
}> {
  const ipAddress = getClientIP(request)
  const now = new Date()
  const windowStart = new Date(now.getTime() - WINDOW_DURATION_MS)

  try {
    // Clean up old rate limit entries older than 5 minutes
    await supabase
      .from('rate_limit_logs')
      .delete()
      .lt('window_end', new Date(now.getTime() - 5 * 60 * 1000).toISOString())

    // Check existing rate limit entry for this IP in current window
    const { data: existingLog, error: queryError } = await supabase
      .from('rate_limit_logs')
      .select('*')
      .eq('endpoint', endpoint)
      .eq('ip_address', ipAddress)
      .gte('window_start', windowStart.toISOString())
      .lte('window_end', now.toISOString())
      .maybeSingle()

    if (queryError) {
      console.error('Rate limit query error:', queryError)
      // On error, allow request (fail open, but log it)
      return {
        allowed: true,
        remaining: MAX_REQUESTS_PER_MINUTE,
        resetAt: new Date(now.getTime() + WINDOW_DURATION_MS),
      }
    }

    if (existingLog) {
      // Entry exists, check if exceeded
      const isExceeded = existingLog.request_count >= MAX_REQUESTS_PER_MINUTE

      if (!isExceeded) {
        // Increment request count
        await supabase
          .from('rate_limit_logs')
          .update({ request_count: existingLog.request_count + 1 })
          .eq('id', existingLog.id)
      }

      return {
        allowed: !isExceeded,
        remaining: Math.max(0, MAX_REQUESTS_PER_MINUTE - existingLog.request_count),
        resetAt: new Date(existingLog.window_end),
        retryAfter: isExceeded
          ? Math.ceil((new Date(existingLog.window_end).getTime() - now.getTime()) / 1000)
          : undefined,
      }
    }

    // No entry exists, create new one
    const windowEnd = new Date(now.getTime() + WINDOW_DURATION_MS)

    const { error: insertError } = await supabase.from('rate_limit_logs').insert([
      {
        endpoint,
        ip_address: ipAddress,
        request_count: 1,
        window_start: now.toISOString(),
        window_end: windowEnd.toISOString(),
      },
    ])

    if (insertError) {
      console.error('Rate limit insert error:', insertError)
      // On error, allow request
      return {
        allowed: true,
        remaining: MAX_REQUESTS_PER_MINUTE - 1,
        resetAt: windowEnd,
      }
    }

    return {
      allowed: true,
      remaining: MAX_REQUESTS_PER_MINUTE - 1,
      resetAt: windowEnd,
    }
  } catch (error) {
    console.error('Rate limit check error:', error)
    // Fail open on unexpected errors
    return {
      allowed: true,
      remaining: MAX_REQUESTS_PER_MINUTE,
      resetAt: new Date(now.getTime() + WINDOW_DURATION_MS),
    }
  }
}
