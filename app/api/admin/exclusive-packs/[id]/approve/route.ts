import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { telegramService } from '@/lib/telegram-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 })
    }

    const { id } = await params
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can approve exclusive packs' }, { status: 403 })
    }

    const approvedAt = new Date().toISOString()

    const { data: pack, error: updateError } = await supabaseAdmin
      .from('products')
      .update({
        status: 'approved',
        approved_by: auth.id,
        approved_at: approvedAt,
        updated_at: approvedAt,
      })
      .eq('id', id)
      .eq('type', 'exclusive')
      .eq('is_active', true)
      .eq('status', 'pending')
      .select('id, name, seller_id')
      .maybeSingle()

    if (updateError) {
      console.error('Approve exclusive pack error:', updateError)
      return NextResponse.json({ error: 'Failed to approve pack' }, { status: 500 })
    }

    if (!pack) {
      return NextResponse.json({ error: 'Pack not found or already processed' }, { status: 404 })
    }

    const { data: seller, error: sellerError } = await supabaseAdmin
      .from('users')
      .select('telegram_id')
      .eq('id', pack.seller_id)
      .maybeSingle()

    const sellerTelegramId = seller?.telegram_id
    if (sellerTelegramId) {
      const message = `✅ Your pack has been approved\nPack: ${(pack as any).name}`
      void telegramService.sendMessage(String(sellerTelegramId), message).catch((telegramError) => {
        console.error('Exclusive pack approve notify failed:', telegramError)
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Exclusive pack approved successfully',
      pack_id: (pack as any).id,
      approved_at: approvedAt,
    })
  } catch (error) {
    console.error('Approve exclusive pack API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
