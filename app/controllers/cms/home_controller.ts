import User from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'
//import db from '@adonisjs/lucid/services/db'
import moment from 'moment'

export default class HomeController {
  public async totalRegisterUser({ response }: HttpContext) {
    const totalRegisterUser = await User.query()
      .apply((s) => s.active())
      .count('* as total')
      .first()

    return response.status(200).send({
      message: 'Success',
      serve: { total: totalRegisterUser?.$extras?.total || 0 },
    })
  }

  public async totalRegisterUserByPeriod({ response }: HttpContext) {
    const currentDate = moment()

    const days = []
    const firstDayOfMonth = currentDate.clone().startOf('month')
    const lastDayOfMonth = currentDate.clone().endOf('month')
    let currentDay = firstDayOfMonth.clone()

    while (currentDay.isSameOrBefore(lastDayOfMonth)) {
      days.push({
        start: currentDay.clone().startOf('day').format('YYYY-MM-DD HH:mm:ss'),
        end: currentDay.clone().endOf('day').format('YYYY-MM-DD HH:mm:ss'),
      })
      currentDay.add(1, 'day')
    }

    const months = []
    const startOfYear = moment().startOf('year')
    const endOfYear = moment().endOf('year')
    let currentMonth = startOfYear.clone()

    while (currentMonth.isSameOrBefore(endOfYear)) {
      months.push({
        start: currentMonth.clone().startOf('month').format('YYYY-MM-DD HH:mm:ss'),
        end: currentMonth.clone().endOf('month').format('YYYY-MM-DD HH:mm:ss'),
      })
      currentMonth.add(1, 'month')
    }

    const [dailyTotals, monthlyTotals] = await Promise.all([
      await Promise.all(
        days.map(async (day) => {
          const total = await User.query()
            .whereBetween('created_at', [day.start, day.end])
            .count('* as total')
            .first()

          return {
            date: moment(day.start).format('YYYY-MM-DD'),
            total: total?.$extras?.total || 0,
          }
        })
      ),
      await Promise.all(
        months.map(async (month) => {
          const total = await User.query()
            .whereBetween('created_at', [month.start, month.end])
            .count('* as total')
            .first()
          const monthDate = moment(month.start)
          return {
            date: monthDate.format('YYYY-MM'),
            monthName: monthDate.format('MMMM'),
            monthNumber: +monthDate.format('M'),
            total: total?.$extras?.total || 0,
          }
        })
      ),
    ])

    return response.status(200).send({
      message: 'Success',
      serve: {
        daily: dailyTotals,
        monthly: monthlyTotals,
      },
    })
  }
}
