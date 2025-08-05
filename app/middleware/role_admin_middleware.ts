import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { Role } from '../enums/role.js'

export default class RoleAdminMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    /**
     * Middleware logic goes here (before the next call)
     */
    if (ctx.auth?.user?.role !== Role.ADMINISTRATOR)
      return ctx.response.status(403).send({ message: 'Forbidden Resource' })

    /**
     * Call next method in the pipeline and return its output
     */
    const output = await next()
    return output
  }
}