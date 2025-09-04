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

  public async getUserCart({ response, request }: HttpContext) {
    const { page = 1, per_page: perPage = 10, q: search = '' } = request.qs()

    const userCart = await User.query()
      .select(['users.id', 'users.first_name', 'users.last_name', 'users.email'])
      .has('carts')
      .if(search, (query) =>
        query
          .whereILike('users.first_name', `%${search}%`)
          .orWhereILike('users.last_name', `%${search}%`)
          .orWhereILike('users.email', `%${search}%`)
          .orWhereHas('carts', (queryCart) =>
            queryCart.whereHas('product', (queryProduct) =>
              queryProduct.whereILike('products.name', `%${search}%`)
            )
          )
      )
      .preload('carts', (query) =>
        query
          .preload('product', (queryProduct) =>
            queryProduct.preload('categoryType').preload('medias')
          )
          .preload('variant')
      )
      .paginate(page, perPage || 10)

    return response.ok({
      message: 'Success',
      serve: {
        data: userCart.toJSON().data,
        ...userCart.toJSON().meta,
      },
    })
  }
}
