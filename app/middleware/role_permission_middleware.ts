import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { Role } from '../enums/role.js'

export default class RolePermissionMiddleware {
  async handle(ctx: HttpContext, next: NextFn, roles: Role[]) {
    /**
     * Middleware logic goes here (before the next call)
     */
    if (!ctx.auth?.user?.role) {
      return ctx.response.status(403).send({ message: 'Forbidden Resource' })
    }

    if (
      !roles.includes(ctx.auth?.user?.role as number) &&
      ctx.auth?.user?.role !== Role.ADMINISTRATOR
    ) {
      return ctx.response.status(403).send({ message: 'Forbidden Resource' })
    }

    return await next()
  }
}