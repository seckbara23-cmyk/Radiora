import type { PlanId, SubscriptionStatus } from '@/lib/billing/subscription'

export interface Plan {
  id: PlanId
  name: string
  description: string
  priceXof: number
  maxRadiologists: number | null
  maxSecretaries: number | null
  features: string[]
  sortOrder: number
  isActive: boolean
}

export interface Subscription {
  id: string
  clinicId: string
  planId: PlanId
  status: SubscriptionStatus
  trialEndsAt: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  graceEndsAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'

export interface Invoice {
  id: string
  clinicId: string
  subscriptionId: string | null
  number: string
  amountXof: number
  currency: string
  status: InvoiceStatus
  periodStart: string | null
  periodEnd: string | null
  dueDate: string | null
  issuedAt: string
  paidAt: string | null
}

export type PaymentMethod = 'wave' | 'orange_money' | 'card' | 'manual'
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'

export interface Payment {
  id: string
  clinicId: string
  invoiceId: string | null
  amountXof: number
  currency: string
  method: PaymentMethod
  status: PaymentStatus
  providerRef: string | null
  paidAt: string | null
  createdAt: string
}
