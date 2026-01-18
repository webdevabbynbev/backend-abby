import type { HttpContext } from '@adonisjs/core/http'
import emitter from '@adonisjs/core/services/emitter'

import { DiscountCmsService } from '#services/discount/discount_cms_service'

export default class DiscountsController {
  private cms = new DiscountCmsService()

  public async get({ response, request }: HttpContext) {
    const { data, meta } = await this.cms.list(request.qs())

    return response.status(200).send({
      message: 'success',
      serve: { data, ...meta },
    })
  }

  public async show({ response, params }: HttpContext) {
    const serve = await this.cms.show(params.id)

    return response.status(200).send({
      message: 'success',
      serve,
    })
  }

  public async create({ response, request, auth }: HttpContext) {
    const discount = await this.cms.create(request.all())
    const d: any = discount

    // @ts-ignore
    await emitter.emit('set:activity-log', {
      roleName: auth.user?.role_name,
      userName: auth.user?.name,
      activity: `Create Discount ${d?.name ?? d?.code ?? ''}`,
      menu: 'Discount',
      data: d?.toJSON ? d.toJSON() : d,
    })

    return response.status(200).send({
      message: 'Successfully created.',
      serve: discount,
    })
  }

  public async update({ response, request, params, auth }: HttpContext) {
    const { discount, oldData } = await this.cms.update(params.id, request.all())
    const d: any = discount
    const od: any = oldData

    // @ts-ignore
    await emitter.emit('set:activity-log', {
      roleName: auth.user?.role_name,
      userName: auth.user?.name,
      activity: `Update Discount ${od?.name ?? od?.code ?? ''}`,
      menu: 'Discount',
      data: {
        old: od,
        new: d?.toJSON ? d.toJSON() : d,
      },
    })

    return response.status(200).send({
      message: 'Successfully updated.',
      serve: discount,
    })
  }

  public async delete({ response, params, auth }: HttpContext) {
    const discount = await this.cms.softDelete(params.id)
    const d: any = discount

    // @ts-ignore
    await emitter.emit('set:activity-log', {
      roleName: auth.user?.role_name,
      userName: auth.user?.name,
      activity: `Delete Discount ${d?.name ?? d?.code ?? params.id}`,
      menu: 'Discount',
      data: d?.toJSON ? d.toJSON() : d,
    })

    return response.status(200).send({
      message: 'Successfully deleted.',
      serve: true,
    })
  }

  public async updateStatus({ response, request, auth }: HttpContext) {
    const discount = await this.cms.updateStatus(request.input('id'), request.input('is_active'))
    const d: any = discount

    // @ts-ignore
    await emitter.emit('set:activity-log', {
      roleName: auth.user?.role_name,
      userName: auth.user?.name,
      activity: `Update Status Discount ${d?.name ?? d?.code ?? request.input('id')}`,
      menu: 'Discount',
      data: d?.toJSON ? d.toJSON() : d,
    })

    return response.status(200).send({
      message: 'Successfully updated.',
      serve: discount,
    })
  }
}
