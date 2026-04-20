"use client"

import { KeyboardEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useLanguage } from '@/lib/language-context'
import type { TranslationKey } from '@/lib/translations'
import { ChatMessage, OrderActionEvent, ORDER_ACTIONS, useOrderChat } from '@/hooks/use-order-chat'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { OrderTimeline } from '@/components/order-timeline'
import { OrderEventTimeline } from '@/components/order-event-timeline'
import { SellerRating } from '@/components/seller-rating'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'

type OrderResponse = {
  success: boolean
  order?: any
  error?: string
}

type FetchOrderOptions = {
  silent?: boolean
}

const ACTIVE_STATUSES = new Set(['open', 'in_progress', 'delivered'])

const formatDate = (value?: string | null) => {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

const getStatusLabel = (status: string) => {
  return status.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

const formatActionTimestamp = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const renderStars = (rating: number) => {
  const filled = Math.max(0, Math.min(5, Math.round(rating)))
  const empty = 5 - filled
  return '*'.repeat(filled) + '.'.repeat(empty)
}

const OrderHeader = memo(function OrderHeader({
  orderId,
  productName,
  gameName,
  status,
  createdAt,
}: {
  orderId: string
  productName: string
  gameName: string
  status: string
  createdAt?: string | null
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Order #{orderId}</h1>
        <p className="mt-1 text-sm text-slate-600">{productName} - {gameName}</p>
      </div>
      <div className="flex flex-col gap-2 sm:items-end">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm uppercase tracking-wide text-slate-700">
            {getStatusLabel(status)}
          </span>
          {status === 'disputed' && (
            <Badge variant="destructive">Disputed</Badge>
          )}
        </div>
        <span className="text-sm text-slate-500">Created {formatDate(createdAt)}</span>
      </div>
    </div>
  )
})

const OrderStatus = memo(function OrderStatus({
  order,
  sellerRating,
  productName,
  gameName,
  offerName,
  quantity,
  accountLabel,
  accountPassword,
  baseAmount,
  platformFee,
  totalCharge,
}: {
  order: any
  sellerRating: { avg: number; total: number } | null
  productName: string
  gameName: string
  offerName: string
  quantity: number
  accountLabel: string
  accountPassword: string | null
  baseAmount: number
  platformFee: number
  totalCharge: number
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Order summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Product</span>
              <span>{productName}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Game</span>
              <span>{gameName}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Offer</span>
              <span>{offerName}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Quantity</span>
              <span>{quantity}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Seller</span>
              <span>{order.seller?.username ?? 'Unassigned'}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Account</span>
              <span>{accountLabel}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Password</span>
              <span>{accountPassword ?? 'Not available'}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Order status</span>
              <span>{getStatusLabel(order.status)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Order amount</span>
              <span>{baseAmount} pts</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Platform fee</span>
              <span>{platformFee} pts</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Total charged</span>
              <span>{totalCharge} pts</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order status</CardTitle>
          <CardDescription>Track your order progress</CardDescription>
        </CardHeader>
        <CardContent>
          <OrderTimeline
            status={order.status}
            deliveredAt={order.delivered_at}
            confirmedAt={order.confirmed_at}
            completedAt={order.completed_at}
            autoReleaseAt={order.auto_release_at}
          />
        </CardContent>
      </Card>

      {sellerRating && (
        <Card>
          <CardHeader>
            <CardTitle>Seller rating</CardTitle>
          </CardHeader>
          <CardContent>
            <SellerRating avgRating={sellerRating.avg} totalReviews={sellerRating.total} size="lg" />
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <p>📦 {Number(order.seller?.completed_orders ?? 0)} orders</p>
              <p>⚠️ {Number(order.seller?.dispute_count ?? 0)} disputes</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
})

const OrderActions = memo(function OrderActions({
  order,
  isSeller,
  isCustomer,
  actionLoading,
  actionMessage,
  onMarkDelivered,
  onConfirmDelivery,
  onCancelOrder,
  onReportDispute,
  disputeLoading,
  isAdmin,
  existingReview,
  reviewRating,
  reviewComment,
  reviewError,
  reviewSuccess,
  onChangeRating,
  onChangeComment,
  onSubmitReview,
  t,
}: {
  order: any
  isSeller: boolean
  isCustomer: boolean
  actionLoading: boolean
  actionMessage: string
  onMarkDelivered: () => Promise<void>
  onConfirmDelivery: () => Promise<void>
  onCancelOrder: (reason: string) => Promise<void>
  onReportDispute: (reason: string) => Promise<void>
  disputeLoading: boolean
  isAdmin: boolean
  existingReview: any
  reviewRating: number
  reviewComment: string
  reviewError: string
  reviewSuccess: string
  onChangeRating: (value: number) => void
  onChangeComment: (value: string) => void
  onSubmitReview: () => Promise<void>
  t: (key: TranslationKey) => string
}) {
  const baseAmount = Number(order.points_amount ?? 0)
  const platformFee = Number(order.platform_fee ?? 0.1)
  const totalCharge = Number(order.total_charge ?? baseAmount + platformFee)
  const quantity = Number(order.quantity ?? 1)
  const offerName = order.offer?.name ?? order.offer?.product?.name ?? 'Unknown product'
  const accountLabel = order.game_account?.account_identifier ?? 'Not available'
  const accountEmail = order.game_account?.account_email ?? null
  const accountPassword = order.game_account?.account_password ?? null

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelReasonOption, setCancelReasonOption] = useState<'seller_not_responding' | 'wrong_order' | 'other' | ''>('')
  const [cancelReasonDetail, setCancelReasonDetail] = useState('')
  const [cancelDialogError, setCancelDialogError] = useState('')
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeDialogError, setDisputeDialogError] = useState('')

  const canCancelOrder =
    order.status !== 'completed' &&
    order.status !== 'cancelled' &&
    order.status !== 'disputed' &&
    (isAdmin ||
      (isCustomer && order.status === 'open') ||
      (isSeller && ['open', 'accepted', 'in_progress'].includes(order.status)))

  const canReportDispute =
    !['completed', 'cancelled', 'disputed'].includes(order.status) &&
    (isSeller || isCustomer)

  const cancelReason =
    cancelReasonOption === 'seller_not_responding'
      ? t('sellerNotResponding')
      : cancelReasonOption === 'wrong_order'
      ? t('wrongOrder')
      : cancelReasonOption === 'other'
      ? cancelReasonDetail.trim()
      : ''

  const canSubmitCancel = Boolean(
    cancelReasonOption &&
      (cancelReasonOption !== 'other' || cancelReasonDetail.trim().length > 3)
  )

  const openCancelDialog = () => {
    setCancelDialogError('')
    setCancelReasonOption('')
    setCancelReasonDetail('')
    setCancelDialogOpen(true)
  }

  const closeCancelDialog = () => {
    if (actionLoading) return
    setCancelDialogOpen(false)
    setCancelDialogError('')
  }

  const confirmCancel = async () => {
    if (!canSubmitCancel) {
      setCancelDialogError('Please select a reason for cancelling the order.')
      return
    }

    try {
      setCancelDialogError('')
      await onCancelOrder(cancelReason)
      setCancelDialogOpen(false)
    } catch (error) {
      setCancelDialogError(error instanceof Error ? error.message : 'Unable to cancel order')
    }
  }

  const openDisputeDialog = () => {
    setDisputeDialogError('')
    setDisputeReason('')
    setDisputeDialogOpen(true)
  }

  const closeDisputeDialog = () => {
    if (disputeLoading) return
    setDisputeDialogOpen(false)
    setDisputeDialogError('')
  }

  const confirmReportDispute = async () => {
    if (!disputeReason.trim()) {
      setDisputeDialogError('Please enter a reason for the dispute.')
      return
    }

    try {
      setDisputeDialogError('')
      await onReportDispute(disputeReason.trim())
      setDisputeReason('')
      setDisputeDialogOpen(false)
    } catch (error) {
      setDisputeDialogError(error instanceof Error ? error.message : 'Unable to report dispute')
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Order details</CardTitle>
          <CardDescription>Manage delivery, confirmation, and review for this order.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-sm text-slate-500">Order amount</p>
              <p className="text-lg font-semibold text-slate-900">{baseAmount} pts</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Quantity</p>
              <p className="text-slate-900">{quantity}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Offer</p>
              <p className="text-slate-900">{offerName}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Seller</p>
              <p className="text-slate-900">{order.seller?.username ?? 'Not assigned'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Game account</p>
              <p className="text-slate-900">{accountLabel}</p>
              {accountEmail && <p className="text-xs text-slate-500">{accountEmail}</p>}
            </div>
            <div>
              <p className="text-sm text-slate-500">Account password</p>
              <p className="text-slate-900">{accountPassword ?? 'Not available (legacy account or not set)'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Delivered at</p>
              <p className="text-slate-900">{formatDate(order.delivered_at)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Confirmed at</p>
              <p className="text-slate-900">{formatDate(order.confirmed_at)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Platform fee</p>
              <p className="text-slate-900">{platformFee} pts</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Total charged</p>
              <p className="text-slate-900">{totalCharge} pts</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Auto release</p>
              <p className="text-slate-900">{formatDate(order.auto_release_at)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Seller earnings</p>
              <p className="text-slate-900">{order.seller_earnings ?? 'TBD'} pts</p>
            </div>
          </div>

          {actionMessage && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{actionMessage}</div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {order.status === 'disputed' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                This order is currently disputed. Order actions are locked until an administrator resolves the dispute.
              </div>
            )}

            {isSeller && ['open', 'accepted', 'in_progress'].includes(order.status) && !order.delivered_at && (
              <Button onClick={onMarkDelivered} disabled={actionLoading || order.status === 'disputed'} className="w-full">
                {actionLoading ? t('markingDelivered') : t('markDelivered')}
              </Button>
            )}

            {isCustomer && order.delivered_at && !order.confirmed_at && (
              <Button variant="secondary" onClick={onConfirmDelivery} disabled={actionLoading || order.status === 'disputed'} className="w-full">
                {actionLoading ? t('confirming') : t('confirmDelivery')}
              </Button>
            )}

            {(isSeller || isCustomer) && canReportDispute && (
              <Button variant="secondary" type="button" onClick={openDisputeDialog} disabled={disputeDialogOpen || disputeLoading} className="w-full">
                {t('reportAProblem')}
              </Button>
            )}

            {(isSeller || isCustomer || isAdmin) && canCancelOrder && (
              <Button variant="destructive" type="button" onClick={openCancelDialog} disabled={actionLoading} className="w-full">
                {actionLoading
                  ? isSeller
                    ? t('rejecting')
                    : t('terminating')
                  : isSeller
                  ? t('rejectOrder')
                  : t('terminateOrder')}
              </Button>
            )}
          </div>

          <Dialog open={cancelDialogOpen} onOpenChange={(open) => !actionLoading && setCancelDialogOpen(open)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{isSeller ? t('rejectOrderTitle') : t('terminateOrderTitle')}</DialogTitle>
                <DialogDescription>
                  {isSeller
                    ? t('rejectAndCancelOrderDescription')
                    : t('cancelOrderDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">{t('whyCancelling')}</p>
                  <RadioGroup value={cancelReasonOption} onValueChange={(value) => setCancelReasonOption(value as any)} className="space-y-2 mt-3">
                    <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer hover:border-slate-300">
                      <RadioGroupItem value="seller_not_responding" id="reason-seller_not_responding" />
                      <span>{t('sellerNotResponding')}</span>
                    </label>
                    <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer hover:border-slate-300">
                      <RadioGroupItem value="wrong_order" id="reason-wrong_order" />
                      <span>{t('wrongOrder')}</span>
                    </label>
                    <label className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer hover:border-slate-300">
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value="other" id="reason-other" />
                        <span>{t('other')}</span>
                      </div>
                      {cancelReasonOption === 'other' && (
                        <Textarea
                          value={cancelReasonDetail}
                          onChange={(event) => setCancelReasonDetail(event.target.value)}
                          placeholder={t('tellWhyCancelling')}
                          rows={3}
                        />
                      )}
                    </label>
                  </RadioGroup>
                  {cancelDialogError && <p className="text-sm text-red-600">{cancelDialogError}</p>}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={closeCancelDialog} disabled={actionLoading}>
                  {t('cancel')}
                </Button>
                <Button
                  variant="destructive"
                  type="button"
                  onClick={confirmCancel}
                  disabled={!canSubmitCancel || actionLoading}
                >
                  {actionLoading
                    ? isSeller
                      ? t('rejecting')
                      : t('terminating')
                    : isSeller
                    ? t('confirmReject')
                    : t('confirmTermination')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={disputeDialogOpen} onOpenChange={(open) => !disputeLoading && setDisputeDialogOpen(open)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('reportOrderDispute')}</DialogTitle>
                <DialogDescription>
                  {t('describeIssueForAdmin')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea
                  value={disputeReason}
                  onChange={(event) => setDisputeReason(event.target.value)}
                  placeholder={t('whatWentWrongOrder')}
                  rows={5}
                />
                {disputeDialogError && <p className="text-sm text-red-600">{disputeDialogError}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={closeDisputeDialog} disabled={disputeLoading}>
                  {t('cancel')}
                </Button>
                <Button
                  type="button"
                  onClick={confirmReportDispute}
                  disabled={!disputeReason.trim() || disputeLoading}
                >
                  {disputeLoading ? t('reporting') : t('reportDispute')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {isCustomer && order.status === 'completed' && (
        <Card>
          <CardHeader>
            <CardTitle>Order review</CardTitle>
            <CardDescription>Leave a review for your seller once the order is completed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {existingReview ? (
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-semibold text-slate-900">Your review</p>
                  <span className="text-lg text-yellow-500">{renderStars(existingReview.rating)}</span>
                </div>
                {existingReview.comment && <p className="mt-3 text-slate-700">{existingReview.comment}</p>}
                <p className="mt-2 text-xs text-slate-500">Submitted on {formatDate(existingReview.created_at)}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-500">Rating</p>
                  <div className="mt-2 flex gap-1">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`text-2xl ${reviewRating >= value ? 'text-yellow-500' : 'text-slate-300'}`}
                        onClick={() => onChangeRating(value)}
                      >
                        *
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Textarea
                    value={reviewComment}
                    onChange={(event) => onChangeComment(event.target.value)}
                    placeholder="Share your experience with this seller"
                    rows={4}
                  />
                </div>
                {reviewError && <p className="text-sm text-red-600">{reviewError}</p>}
                {reviewSuccess && <p className="text-sm text-green-600">{reviewSuccess}</p>}
                <Button onClick={onSubmitReview} className="w-full">
                  {t('submitReview')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
})

const OrderActionHistory = memo(function OrderActionHistory({
  actions,
  getActionLabel,
}: {
  actions: OrderActionEvent[]
  getActionLabel: (event: OrderActionEvent) => string
}) {
  if (actions.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order activity</CardTitle>
        <CardDescription>Recent order events from the real-time socket stream.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.slice(-10).reverse().map((event) => {
          const label = getActionLabel(event)
          const time = formatActionTimestamp(event.created_at)
          const statusClass =
            event.action === 'complete_order'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : event.action === 'cancel_order'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-slate-50 border-slate-200 text-slate-700'

          return (
            <div
              key={`${event.orderId}:${event.action}:${event.userId}:${event.created_at ?? JSON.stringify(event.data)}`}
              className={`rounded-lg border p-3 transition duration-200 ${statusClass}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{label}</p>
                {time && <span className="text-xs text-slate-500">{time}</span>}
              </div>
              <p className="mt-2 text-xs text-slate-500">{event.action.replace('_', ' ')}</p>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
})

const OrderMessages = memo(function OrderMessages({
  canChat,
  chatAvailable,
  chatError,
  connected,
  socketStatus,
  queuedMessageCount,
  typingUsers,
  onlineUserIds,
  messages,
  messagesLoading,
  messageText,
  sendingMessage,
  onMessageChange,
  onSendMessage,
}: {
  canChat: boolean
  chatAvailable: boolean
  connected: boolean
  socketStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  queuedMessageCount: number
  typingUsers: { userId: string; username: string }[]
  onlineUserIds: string[]
  chatError: string
  messages: ChatMessage[]
  messagesLoading: boolean
  messageText: string
  sendingMessage: boolean
  onMessageChange: (value: string) => void
  onSendMessage: () => Promise<void>
}) {
  const handleEnter = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        onSendMessage()
      }
    },
    [onSendMessage]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order chat</CardTitle>
        <CardDescription>Messages between the seller and customer for this order.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canChat ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Only this order's customer and seller can access the chat.
          </div>
        ) : (
          <>
            {chatError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                {chatError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
              <span
                className={`font-medium ${
                  socketStatus === 'connected'
                    ? 'text-emerald-700'
                    : socketStatus === 'disconnected'
                    ? 'text-red-700'
                    : 'text-amber-700'
                }`}
              >
                {socketStatus === 'connected'
                  ? '🟢 Online'
                  : socketStatus === 'connecting'
                  ? '🟡 Connecting...'
                  : socketStatus === 'reconnecting'
                  ? '🟡 Reconnecting...'
                  : '🔴 Offline'}
              </span>
              {queuedMessageCount > 0 && <span>{queuedMessageCount} queued message(s)</span>}
              {connected && onlineUserIds.length > 0 && <span>{onlineUserIds.length} online</span>}
              {typingUsers.length > 0 && (
                <span>{typingUsers.map((user) => user.username).join(', ')} typing…</span>
              )}
            </div>

            {!connected && socketStatus !== 'disconnected' && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                Connecting to chat server...
              </div>
            )}

            <div className="space-y-3">
              {messagesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((index) => (
                    <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <Skeleton className="h-4 w-1/3 mb-3" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  No messages yet. Start the conversation to keep the seller and customer in sync.
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-900">{message.sender.username}</p>
                      <p className="text-xs text-slate-500">{formatDate(message.created_at)}</p>
                    </div>
                    <p className="mt-2 text-slate-700">{message.content}</p>
                  </div>
                ))
              )}
            </div>

            <div className="grid gap-3">
              <Input
                value={messageText}
                onChange={(event) => onMessageChange(event.target.value)}
                onKeyDown={handleEnter}
                disabled={!chatAvailable || !connected}
                placeholder="Write a message..."
              />
              <Button
                onClick={onSendMessage}
                disabled={!chatAvailable || !connected || sendingMessage || !messageText.trim()}
                className="w-full"
              >
                {sendingMessage ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    {chatAvailable ? 'Send message' : 'Chat unavailable'}
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
})

export default function OrderDetailsPage() {
  const { id } = useParams() as { id: string }
  const { user } = useAuth()
  const { t } = useLanguage()

  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [messageText, setMessageText] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [disputeLoading, setDisputeLoading] = useState(false)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [existingReview, setExistingReview] = useState<any>(null)
  const [orderEvents, setOrderEvents] = useState<any[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewSuccess, setReviewSuccess] = useState('')
  const [sellerRating, setSellerRating] = useState<{ avg: number; total: number } | null>(null)

  const lastOrderSnapshotRef = useRef<string>('')
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null

  const {
    messages,
    loading: messagesLoading,
    error: chatError,
    chatAvailable,
    connected,
    socketStatus,
    queuedMessageCount,
    typingUsers,
    onlineUserIds,
    orderActions,
    sendMessage,
    sendOrderAction,
    sendTyping,
  } = useOrderChat(id, token)

  const sellerId = order?.assigned_seller_id
  const isSeller = user?.role === 'seller' && user?.id === sellerId
  const isCustomer = user?.role === 'customer' && user?.id === order?.customer_id
  const isAdmin = user?.role === 'admin'
  const canChat = Boolean(user && order && (isSeller || isCustomer || isAdmin))
  const lastOrderActionKeyRef = useRef('')
  const refreshOrderTimeoutRef = useRef<number | null>(null)

  const getOrderActionMessage = useCallback(
    (event: OrderActionEvent) => {
      const actor = event.userId === user?.id ? 'You' : event.username
      switch (event.action) {
        case 'accept_order':
          return `${actor} accepted this order.`
        case 'complete_order':
          return `${actor} marked this order as complete.`
        case 'cancel_order':
          return `${actor} cancelled this order.`
        case 'report_dispute':
          return `${actor} reported a dispute for this order.`
        case 'validate_order':
          return `${actor} validated this order.`
        case 'topup_request':
          return `${actor} requested a top-up.`
        case 'withdraw_request':
          return `${actor} requested a withdrawal.`
        default:
          return `${actor} updated the order.`
      }
    },
    [user?.id]
  )

  const applyOrderActionToOrder = useCallback(
    (event: OrderActionEvent, previousOrder: any) => {
      if (!previousOrder) return previousOrder

      switch (event.action) {
        case 'accept_order':
          return { ...previousOrder, status: 'in_progress' }
        case 'complete_order':
          return {
            ...previousOrder,
            status: 'completed',
            completed_at: previousOrder.completed_at ?? new Date().toISOString(),
          }
        case 'cancel_order':
          return { ...previousOrder, status: 'cancelled' }
        default:
          return previousOrder
      }
    },
    []
  )

  const fetchOrder = useCallback(
    async (options: FetchOrderOptions = {}) => {
      if (!id || !token) return null
      const { silent = false } = options

      if (!silent) {
        setLoading(true)
      }

      try {
        if (!silent) {
          setError('')
        }

        const response = await fetch(`/api/orders/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        const data: OrderResponse = await response.json()
        if (!response.ok || !data.success || !data.order) {
          throw new Error(data.error || 'Unable to load order')
        }

        const nextOrder = data.order
        const nextSnapshot = JSON.stringify(nextOrder)

        if (lastOrderSnapshotRef.current !== nextSnapshot) {
          lastOrderSnapshotRef.current = nextSnapshot
          setOrder(nextOrder)
        }

        return nextOrder
      } catch (fetchError) {
        console.error('Fetch order error:', fetchError)
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load order')
        return null
      } finally {
        if (!silent) {
          setLoading(false)
        }
      }
    },
    [id, token]
  )

  const fetchOrderEvents = useCallback(
    async (silent = false) => {
      if (!id || !token) return []
      if (!silent) {
        setEventsLoading(true)
      }

      try {
        const response = await fetch(`/api/orders/${id}/events`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        const data = await response.json()
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Unable to load order timeline')
        }

        setOrderEvents(data.events ?? [])
        return data.events ?? []
      } catch (fetchError) {
        console.error('Fetch order events error:', fetchError)
        return []
      } finally {
        if (!silent) {
          setEventsLoading(false)
        }
      }
    },
    [id, token]
  )

  useEffect(() => {
    if (!orderActions.length || !id) return

    const latestAction = orderActions[orderActions.length - 1]
    const actionKey = `${latestAction.orderId}:${latestAction.action}:${latestAction.userId}:${JSON.stringify(latestAction.data)}`
    if (lastOrderActionKeyRef.current === actionKey) return

    lastOrderActionKeyRef.current = actionKey
    const description = getOrderActionMessage(latestAction)
    toast.success(description)
    setOrder((previous) => applyOrderActionToOrder(latestAction, previous))

    if (refreshOrderTimeoutRef.current) {
      window.clearTimeout(refreshOrderTimeoutRef.current)
    }

    refreshOrderTimeoutRef.current = window.setTimeout(() => {
      void fetchOrder({ silent: true })
      void fetchOrderEvents(true)
      refreshOrderTimeoutRef.current = null
    }, 300)

    return () => {
      if (refreshOrderTimeoutRef.current) {
        window.clearTimeout(refreshOrderTimeoutRef.current)
        refreshOrderTimeoutRef.current = null
      }
    }
  }, [applyOrderActionToOrder, fetchOrder, fetchOrderEvents, getOrderActionMessage, id, orderActions])

  const fetchSellerRating = useCallback(async () => {
    if (!sellerId || !token) return
    try {
      const response = await fetch(`/api/reviews?seller_id=${sellerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (response.ok && data.avg_rating !== undefined) {
        setSellerRating((previous) => {
          const next = {
            avg: data.avg_rating,
            total: data.total_reviews ?? 0,
          }
          if (previous && previous.avg === next.avg && previous.total === next.total) {
            return previous
          }
          return next
        })
      }
    } catch (fetchError) {
      console.error('Fetch seller rating error:', fetchError)
    }
  }, [sellerId, token])

  const fetchReview = useCallback(async () => {
    if (!id || !token || !isCustomer) return
    try {
      const response = await fetch(`/api/reviews?order_id=${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (response.ok && data.reviews?.length > 0) {
        const review = data.reviews[0]
        setExistingReview((previous: any) => {
          const previousId = previous?.id ?? null
          return previousId === review.id ? previous : review
        })
      }
    } catch (fetchError) {
      console.error('Fetch existing review error:', fetchError)
    }
  }, [id, isCustomer, token])

  useEffect(() => {
    if (!id || !user) return
    fetchOrder()
    void fetchOrderEvents()
  }, [fetchOrder, fetchOrderEvents, id, user])

  useEffect(() => {
    fetchSellerRating()
  }, [fetchSellerRating])

  useEffect(() => {
    fetchReview()
  }, [fetchReview])

  useEffect(() => {
    if (!id || !token) return

    const pollOrder = async () => {
      if (document.visibilityState !== 'visible') return
      await fetchOrder({ silent: true })
    }

    const pollDelay = ACTIVE_STATUSES.has(order?.status) ? 15000 : 60000
    const interval = window.setInterval(pollOrder, pollDelay)
    const onFocus = () => {
      void fetchOrder({ silent: true })
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', pollOrder)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', pollOrder)
    }
  }, [fetchOrder, id, order?.status, token])

  const handleSendMessage = useCallback(async () => {
    if (!messageText.trim()) return
    setSendingMessage(true)
    try {
      const message = await sendMessage(messageText)
      if (message) {
        setMessageText('')
      }
    } catch (sendError) {
      console.error('Send chat message error:', sendError)
    } finally {
      setSendingMessage(false)
    }
  }, [messageText, sendMessage])

  const handleMessageChange = useCallback(
    (value: string) => {
      setMessageText(value)
      sendTyping()
    },
    [sendTyping]
  )

  const handleMarkDelivered = useCallback(async () => {
    if (!id || !token) return
    setActionLoading(true)
    setActionMessage('')
    try {
      const response = await fetch(`/api/orders/${id}/deliver`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to mark delivered')
      }

      setActionMessage(data.message ?? 'Order marked as delivered')
      setOrder((previous: any) => {
        if (!previous) return previous
        return { ...previous, status: 'delivered', delivered_at: new Date().toISOString() }
      })
      await fetchOrder({ silent: true })
      await fetchOrderEvents(true)
    } catch (actionError) {
      console.error(actionError)
      setActionMessage(actionError instanceof Error ? actionError.message : 'Failed to mark delivered')
    } finally {
      setActionLoading(false)
    }
  }, [fetchOrder, id, token])

  const handleConfirmDelivery = useCallback(async () => {
    if (!id || !token) return
    setActionLoading(true)
    setActionMessage('')
    try {
      const response = await fetch(`/api/orders/${id}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to confirm delivery')
      }

      setActionMessage(data.message ?? 'Delivery confirmed')
      setOrder((previous: any) => {
        if (!previous) return previous
        return { ...previous, status: 'completed', confirmed_at: new Date().toISOString() }
      })
      await fetchOrder({ silent: true })
      await fetchOrderEvents(true)
    } catch (actionError) {
      console.error(actionError)
      setActionMessage(actionError instanceof Error ? actionError.message : 'Failed to confirm delivery')
    } finally {
      setActionLoading(false)
    }
  }, [fetchOrder, id, token])

  const handleCancelOrder = useCallback(async (reason: string) => {
    if (!id || !token) return
    setActionLoading(true)
    setActionMessage('')
    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'cancelled', cancel_reason: reason }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to terminate order')
      }

      setActionMessage(data.message ?? 'Order terminated')
      setOrder((previous: any) => {
        if (!previous) return previous
        return { ...previous, status: 'cancelled', cancel_reason: reason }
      })

      try {
        await sendOrderAction(ORDER_ACTIONS.CANCEL_ORDER, { reason })
      } catch (socketError) {
        console.warn('Unable to broadcast order cancel event:', socketError)
      }

      await fetchOrder({ silent: true })
      await fetchOrderEvents(true)
    } catch (actionError) {
      console.error(actionError)
      setActionMessage(actionError instanceof Error ? actionError.message : 'Failed to terminate order')
      throw actionError
    } finally {
      setActionLoading(false)
    }
  }, [ORDER_ACTIONS.CANCEL_ORDER, fetchOrder, id, sendOrderAction, token])

  const handleReportDispute = useCallback(async (reason: string) => {
    if (!id || !token) return
    setDisputeLoading(true)
    setActionMessage('')
    try {
      const response = await fetch(`/api/orders/${id}/dispute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to report dispute')
      }

      setActionMessage(data.message ?? 'Dispute reported to admin')
      setOrder((previous: any) => (previous ? { ...previous, status: 'disputed' } : previous))

      try {
        await sendOrderAction(ORDER_ACTIONS.REPORT_DISPUTE, { reason })
      } catch (socketError) {
        console.warn('Unable to broadcast dispute event:', socketError)
      }

      await fetchOrder({ silent: true })
      await fetchOrderEvents(true)
    } catch (actionError) {
      console.error(actionError)
      throw actionError
    } finally {
      setDisputeLoading(false)
    }
  }, [ORDER_ACTIONS.REPORT_DISPUTE, fetchOrder, fetchOrderEvents, id, sendOrderAction, token])

  const handleSubmitReview = useCallback(async () => {
    if (!id || !token || existingReview) return
    if (!reviewRating || reviewRating < 1 || reviewRating > 5) {
      setReviewError('Select a rating between 1 and 5')
      return
    }

    setReviewError('')
    setReviewSuccess('')

    try {
      const response = await fetch(`/api/orders/${id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment.trim() }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to submit review')
      }

      setReviewSuccess(data.already_exists ? 'Review already submitted' : 'Review submitted successfully')
      setExistingReview(data.review)
      await fetchSellerRating()
    } catch (submitError) {
      console.error(submitError)
      setReviewError(submitError instanceof Error ? submitError.message : 'Failed to submit review')
    }
  }, [existingReview, fetchSellerRating, id, reviewComment, reviewRating, token])

  const orderView = useMemo(() => {
    if (!order) return null

    const gameName =
      order.offer?.product?.game?.name ??
      order.game_name ??
      order.game?.name ??
      'Game service'

    const productName =
      order.offer?.product?.name ??
      order.offer?.name ??
      order.product_name ??
      order.offer_name ??
      'Order service'

    const offerName = order.offer?.name ?? order.offer_name ?? productName
    const baseAmount = Number(order.points_amount ?? 0)
    const platformFee = Number(order.platform_fee ?? 0.1)
    const totalCharge = Number(order.total_charge ?? baseAmount + platformFee)
    const quantity = Number(order.quantity ?? 1)
    const accountLabel = order.game_account?.account_identifier ?? 'Not available'
    const accountPassword = order.game_account?.account_password ?? null

    return {
      gameName,
      productName,
      offerName,
      baseAmount,
      platformFee,
      totalCharge,
      quantity,
      accountLabel,
      accountPassword,
    }
  }, [order])

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading order...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
      </div>
    )
  }

  if (!order || !orderView) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-slate-700">Order not found.</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <OrderHeader
        orderId={order.id}
        productName={orderView.productName}
        gameName={orderView.gameName}
        status={order.status}
        createdAt={order.created_at}
      />

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <OrderActions
            order={order}
            isSeller={Boolean(isSeller)}
            isCustomer={Boolean(isCustomer)}
            isAdmin={Boolean(isAdmin)}
            t={t}
            actionLoading={actionLoading}
            disputeLoading={disputeLoading}
            actionMessage={actionMessage}
            onMarkDelivered={handleMarkDelivered}
            onConfirmDelivery={handleConfirmDelivery}
            onCancelOrder={handleCancelOrder}
            onReportDispute={handleReportDispute}
            existingReview={existingReview}
            reviewRating={reviewRating}
            reviewComment={reviewComment}
            reviewError={reviewError}
            reviewSuccess={reviewSuccess}
            onChangeRating={setReviewRating}
            onChangeComment={setReviewComment}
            onSubmitReview={handleSubmitReview}
          />

          <Card>
            <CardHeader>
              <CardTitle>Order timeline</CardTitle>
              <CardDescription>Track order history and status changes.</CardDescription>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="space-y-3 py-4">
                  {[1, 2].map((index) => (
                    <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <Skeleton className="h-4 w-3/4 mb-3" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  ))}
                </div>
              ) : orderEvents.length > 0 ? (
                <OrderEventTimeline events={orderEvents} />
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
                  No order history has been recorded yet. Most action details will appear here once progress begins.
                </div>
              )}
            </CardContent>
          </Card>

          <OrderActionHistory actions={orderActions} getActionLabel={getOrderActionMessage} />

          <OrderMessages
            canChat={canChat}
            chatAvailable={chatAvailable}
            connected={connected}
            socketStatus={socketStatus}
            queuedMessageCount={queuedMessageCount}
            typingUsers={typingUsers}
            onlineUserIds={onlineUserIds}
            chatError={chatError}
            messages={messages}
            messagesLoading={messagesLoading}
            messageText={messageText}
            sendingMessage={sendingMessage}
            onMessageChange={handleMessageChange}
            onSendMessage={handleSendMessage}
          />
        </div>

        <OrderStatus
          order={order}
          sellerRating={sellerRating}
          productName={orderView.productName}
          gameName={orderView.gameName}
          offerName={orderView.offerName}
          quantity={orderView.quantity}
          accountLabel={orderView.accountLabel}
          accountPassword={orderView.accountPassword}
          baseAmount={orderView.baseAmount}
          platformFee={orderView.platformFee}
          totalCharge={orderView.totalCharge}
        />
      </div>
    </div>
  )
}
