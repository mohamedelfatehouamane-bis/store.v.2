import { NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

type PaymentMethodRow = {
  id: string
  name: string
  display_name: string
  instructions: string
}

type PaymentMethodAccountRow = {
  id: string
  payment_method_id: string
  account_number: string
  account_name: string
  usage_count?: number | null
  priority?: number | null
  last_used?: string | null
}

function pickSafestAccount(accounts: PaymentMethodAccountRow[]): PaymentMethodAccountRow | null {
  if (accounts.length === 0) return null

  return [...accounts].sort((a, b) => {
    const usageA = Number(a.usage_count ?? 0)
    const usageB = Number(b.usage_count ?? 0)
    const priorityA = Math.max(1, Number(a.priority ?? 1))
    const priorityB = Math.max(1, Number(b.priority ?? 1))

    const scoreA = usageA / priorityA
    const scoreB = usageB / priorityB

    if (scoreA !== scoreB) return scoreA - scoreB

    const usedAtA = a.last_used ? new Date(a.last_used).getTime() : 0
    const usedAtB = b.last_used ? new Date(b.last_used).getTime() : 0
    if (usedAtA !== usedAtB) return usedAtA - usedAtB

    return a.id.localeCompare(b.id)
  })[0]
}

export async function GET() {
  try {
    const { data: methods, error: methodsError } = await supabase
      .from('payment_methods')
      .select('id, name, display_name, instructions')
      .eq('is_active', true)
      .order('display_name', { ascending: true })

    if (methodsError || !methods) {
      console.error('Payment methods query error:', methodsError)
      return NextResponse.json({ paymentMethods: [] })
    }

    const { data: accounts, error: accountsError } = await supabase
      .from('payment_method_accounts')
      .select('id, payment_method_id, account_number, account_name, usage_count, priority, last_used')
      .eq('is_active', true)

    if (accountsError) {
      console.error('Payment method accounts query error:', accountsError)
      return NextResponse.json({ paymentMethods: [] })
    }

    const paymentMethods = (methods as PaymentMethodRow[]).map((method) => {
      const methodAccounts = (accounts as PaymentMethodAccountRow[]).filter(
        (account) => account.payment_method_id === method.id
      )
      const selectedAccount = pickSafestAccount(methodAccounts)

      return {
        ...method,
        payment_account_id: selectedAccount?.id ?? null,
        account_number: selectedAccount?.account_number ?? null,
        account_name: selectedAccount?.account_name ?? null,
      }
    })

    return NextResponse.json({ paymentMethods })
  } catch (error) {
    console.error('Get payment methods error:', error)
    return NextResponse.json({ paymentMethods: [] })
  }
}
