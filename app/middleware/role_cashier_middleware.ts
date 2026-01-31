import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { Role } from '../enums/role.js'

export default class RoleCashierMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    // DISABLE ROLE CHECK FOR STAGING - REMOVE THIS CONDITION AFTER STAGING
    if (process.env.NODE_ENV !== 'production') {
      return next()
    }
    
    await ctx.auth.authenticate()

    const userRole = Number(ctx.auth.user?.role)

    if (userRole !== Role.CASHIER) {
      return ctx.response.status(403).send({ message: 'Forbidden Resource' })
    }

    return await next()
  }
}