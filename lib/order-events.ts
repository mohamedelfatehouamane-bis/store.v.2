export async function addOrderEvent(db: any, {
  orderId,
  type,
  message,
  userId,
}: {
  orderId: string
  type: string
  message: string
  userId?: string | null
}) {
  try {
    return await db.from('order_events').insert({
      order_id: orderId,
      type,
      message,
      created_by: userId ?? null,
    })
  } catch (error) {
    console.warn('Order event logging skipped:', error)
    return null
  }
}
