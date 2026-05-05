import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyToken } from '@/lib/auth'
import { decryptGameAccountSecret } from '@/lib/game-account-secrets'
import { telegramService } from '@/lib/telegram-service'
import { addOrderEvent } from '@/lib/order-events'
import { calculateTrustScore } from '@/lib/trust-score'
import { normalizeStatus, ORDER_STATUS } from '@/lib/order-status'

const updateOrderSchema = z.object({
status: z.string(),
cancel_reason: z.string().optional(),
})

// ================= GET ORDER =================
export async function GET(
request: NextRequest,
{ params }: { params: Promise<{ id: string }> }
) {
try {
const { id } = await params

```
const authHeader = request.headers.get('authorization')
if (!authHeader?.startsWith('Bearer ')) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

const auth = verifyToken(authHeader.substring(7))
if (!auth) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

console.log('[GET ORDER] ID:', id, 'USER:', auth.id, 'ROLE:', auth.role)

// 🔥 USE ADMIN CLIENT (FIX)
const { data: order, error } = await supabaseAdmin
  .from('orders')
  .select('*')
  .eq('id', id)
  .single()

if (error || !order) {
  console.log('[GET ORDER] NOT FOUND:', id)
  return NextResponse.json({ error: 'Order not found' }, { status: 404 })
}

// 🔒 SECURITY CHECK (VERY IMPORTANT)
const isAuthorized =
  order.customer_id === auth.id ||
  order.assigned_seller_id === auth.id ||
  auth.role === 'admin'

if (!isAuthorized) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
}

// ===== LOAD RELATIONS =====
const fullOrder: any = { ...order }

if (order.assigned_seller_id) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('username, avatar_url, rating, total_reviews')
    .eq('id', order.assigned_seller_id)
    .maybeSingle()

  if (data) {
    fullOrder.seller = {
      ...data,
      trust_score: calculateTrustScore(data as any),
    }
  }
}

if (order.customer_id) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('username')
    .eq('id', order.customer_id)
    .maybeSingle()

  if (data) fullOrder.customer = data
}

if (order.game_account_id) {
  const { data } = await supabaseAdmin
    .from('game_accounts')
    .select('*')
    .eq('id', order.game_account_id)
    .maybeSingle()

  if (data) {
    const password = decryptGameAccountSecret(data.account_password_encrypted)

    fullOrder.game_account = {
      ...data,
      account_password: password,
    }
  }
}

const platformFee = Number(order.platform_fee ?? 0)
const totalAmount = Number(order.points_amount ?? 0)

return NextResponse.json({
  success: true,
  order: {
    ...fullOrder,
    total_charge: totalAmount + platformFee,
  },
})
```

} catch (err) {
console.error('[GET ORDER ERROR]', err)
return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
}
