import db from '@adonisjs/lucid/services/db'
import moment from 'moment'
import Transaction from '#models/transaction'
import { TransactionStatus } from '../../../enums/transaction_status.js'

import {
  getDayKeysInMonth,
  getMonthKeysInYear,
  getMonthContext,
  type MonthKey,
} from '#services/cms/dashboard/period_helper'

export class DashboardTransactionsService {
  async totalCompletedTransactions(): Promise<number> {
    const row = await Transaction.query()
      .where('transactionStatus', TransactionStatus.COMPLETED)
      .count('* as total')
      .first()

    return Number(row?.$extras?.total || 0)
  }

  async totalCompletedTransactionsByMonth(month?: any): Promise<number> {
    const { monthlyStart, monthlyEnd } = getMonthContext(month)

    const row = await Transaction.query()
      .whereBetween('created_at', [monthlyStart, monthlyEnd])
      .where('transactionStatus', TransactionStatus.COMPLETED)
      .count('* as total')
      .first()

    return Number(row?.$extras?.total || 0)
  }

  // NOTE: query param masih "paymentStatus" (legacy), filter tetap ke transactionStatus
  async totalTransactionsByStatus(paymentStatus?: any): Promise<number> {
    const raw = String(paymentStatus ?? '').trim()
    const statusNum = raw === '' ? null : Number(raw)

    const q = Transaction.query()
    if (statusNum !== null && Number.isFinite(statusNum)) {
      q.where('transactionStatus', statusNum)
    }

    const row = await q.count('* as total').first()
    return Number(row?.$extras?.total || 0)
  }

  /**
   * Daily + Monthly completed transactions
   * PostgreSQL-safe (NO DATE_FORMAT)
   */
  async completedTransactionsByPeriod() {
    const now = moment()

    const startMonth = now.clone().startOf('month').toDate()
    const endMonth = now.clone().endOf('month').toDate()
    const dayKeys: string[] = getDayKeysInMonth(now)

    // =========================
    // DAILY
    // =========================
    const dailyRows = await Transaction.query()
      .whereBetween('created_at', [startMonth, endMonth])
      .where('transactionStatus', TransactionStatus.COMPLETED)
      .select(db.raw('DATE(created_at) as d'))
      .count('* as total')
      .groupByRaw('DATE(created_at)')

    const dailyMap = new Map<string, number>()
    for (const r of dailyRows) {
      const key = String(r.$extras?.d)
      dailyMap.set(key, Number(r.$extras?.total || 0))
    }

    const daily = dayKeys.map((date: string) => ({
      date,
      total: dailyMap.get(date) || 0,
    }))

    // =========================
    // MONTHLY (POSTGRES FIX)
    // =========================
    const startYear = now.clone().startOf('year').toDate()
    const endYear = now.clone().endOf('year').toDate()
    const monthKeys: MonthKey[] = getMonthKeysInYear(now)

    const monthlyRows = await Transaction.query()
      .whereBetween('created_at', [startYear, endYear])
      .where('transactionStatus', TransactionStatus.COMPLETED)
      .select(db.raw("to_char(created_at, 'YYYY-MM') as ym"))
      .count('* as total')
      .groupByRaw("to_char(created_at, 'YYYY-MM')")

    const monthlyMap = new Map<string, number>()
    for (const r of monthlyRows) {
      const key = String(r.$extras?.ym)
      monthlyMap.set(key, Number(r.$extras?.total || 0))
    }

    const monthly = monthKeys.map((m: MonthKey) => ({
      ...m,
      total: monthlyMap.get(m.date) || 0,
    }))

    return { daily, monthly }
  }

  /**
   * Transaction status breakdown per month
   */
  async statusBreakdownByMonth(month?: any) {
    const { monthlyStart, monthlyEnd } = getMonthContext(month)

    const defaultStatus: Record<string, { total: number; label: string }> = {
      '1': { total: 0, label: 'Waiting Payment' },
      '2': { total: 0, label: 'On Process' },
      '3': { total: 0, label: 'On Delivery' },
      '4': { total: 0, label: 'Completed' },
      '9': { total: 0, label: 'Failed' },
    }

    const rows = await Transaction.query()
      .select('transactionStatus')
      .whereBetween('created_at', [monthlyStart, monthlyEnd])
      .groupBy('transactionStatus')
      .count('* as total')

    const acc = { ...defaultStatus }

    for (const item of rows) {
      const status = String(item.transactionStatus)
      if (acc[status]) {
        acc[status] = {
          total: Number(item.$extras?.total || 0),
          label: acc[status].label,
        }
      }
    }

    return Object.values(acc)
  }
}
