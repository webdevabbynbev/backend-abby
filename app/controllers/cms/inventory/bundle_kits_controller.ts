import type { HttpContext } from '@adonisjs/core/http'
import emitter from '@adonisjs/core/services/emitter'
import { BundleKitService } from '#services/bundle/bundle_kit_service'

export default class BundleKitsController {
  private kit = new BundleKitService()

  public async assemble({ params, request, response, auth }: HttpContext) {
    try {
      const variantId = Number(params.variantId || params.id || 0)
      const { qty, note } = request.all()

      if (!variantId) {
        return response.status(400).send({ message: 'variantId invalid', serve: null })
      }

      const result = await this.kit.assemble(variantId, qty, note)

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Assemble Bundle Stock`,
        menu: 'Stock Management',
        data: { variantId, qty, note },
      })

      return response.ok({ message: 'Bundle assembled', serve: result })
    } catch (error) {
      return response.status(error.httpStatus || 500).send({
        message: error.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  public async disassemble({ params, request, response, auth }: HttpContext) {
    try {
      const variantId = Number(params.variantId || params.id || 0)
      const { qty, note } = request.all()

      if (!variantId) {
        return response.status(400).send({ message: 'variantId invalid', serve: null })
      }

      const result = await this.kit.disassemble(variantId, qty, note)

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Disassemble Bundle Stock`,
        menu: 'Stock Management',
        data: { variantId, qty, note },
      })

      return response.ok({ message: 'Bundle disassembled', serve: result })
    } catch (error) {
      return response.status(error.httpStatus || 500).send({
        message: error.message || 'Internal Server Error',
        serve: null,
      })
    }
  }
}
