import db from '@adonisjs/lucid/services/db'
import moment from 'moment'
import User from '#models/user'

import {
  getDayKeysInMonth,
  getMonthKeysInYear,
  type MonthKey,
} from '#services/cms/dashboard/period_helper'

export class DashboardUsersService {
  async totalRegisteredActiveUsers(): Promise<number> {
    const row = await User.query()
      .apply((s) => s.active())
      .count('* as total')
      .first()

    return Number(row?.$extras?.total || 0)
  }

  /**
   * Daily + Monthly registered users
   * PostgreSQL-safe
   */
  async registeredUsersByPeriod() {
    const now = moment()

    // =========================
    // DAILY
    // =========================
    const startMonth = now.clone().startOf('month').toDate()
    const endMonth = now.clone().endOf('month').toDate()
    const dayKeys: string[] = getDayKeysInMonth(now)

    const dailyRows = await User.query()
      .whereBetween('created_at', [startMonth, endMonth])
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

    const monthlyRows = await User.query()
      .whereBetween('created_at', [startYear, endYear])
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
}
