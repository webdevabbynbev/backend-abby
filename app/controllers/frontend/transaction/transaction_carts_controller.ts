import type { HttpContext } from '@adonisjs/core/http'
import { CartService } from '../../../services/cart/cart_service.js'
import { fail, ok } from '#utils/response'
import { GuestUserService } from '#services/guest/guest_user_service'

function getUserId(auth: any): number | null {
  const id = Number(auth?.user?.id ?? 0)
  return id > 0 ? id : null
}

function normalizeCartListQs(qs: any) {
  const out = qs || {}

  // support FE yang kirim isCheckout (camelCase)
  if (typeof out.is_checkout === 'undefined' && typeof out.isCheckout !== 'undefined') {
    out.is_checkout = out.isCheckout
  }

  // optional: kalau FE ada yang kirim perPage
  if (typeof out.per_page === 'undefined' && typeof out.perPage !== 'undefined') {
    out.per_page = out.perPage
  }

  return out
}

function parseCartIds(raw: any): number[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
}

function parseIsCheckout(raw1: any, raw2: any): number | null {
  const picked = typeof raw1 !== 'undefined' ? raw1 : raw2
  const n = Number(picked)
  return Number.isFinite(n) ? n : null
}

export default class TransactionCartsController {
  private cartService = new CartService()
  private guestUsers = new GuestUserService()

  private async resolveUserId(ctx: HttpContext): Promise<number | null> {
    await ctx.auth.check()
    const userId = getUserId(ctx.auth)
    if (userId) return userId

    const guest = await this.guestUsers.resolve(ctx)
    return guest.id
  }

  // total item di icon keranjang
  public async getTotal(ctx: HttpContext) {
    const { response, auth, request } = ctx
    try {
      const userId = await this.resolveUserId(ctx)
      if (!userId) return fail(response, 401, 'Unauthenticated', null)

      const dataCart = await this.cartService.getTotal(userId)

      // kompatibel FE (serve + data)
      return ok(response, dataCart, 200, 'success', { data: dataCart })
    } catch (error: any) {
      return fail(response, 500, error?.message || 'Internal Server Error.', [])
    }
  }

  public async get(ctx: HttpContext) {
    const { response, request, auth } = ctx
    try {
      const userId = await this.resolveUserId(ctx)
      if (!userId) return fail(response, 401, 'Unauthenticated', null)

      const qs: any = normalizeCartListQs(request.qs() || {})

      const { items, subtotal, meta } = await this.cartService.getList(userId, qs, request)

      // ✅ return dua bentuk supaya FE lama & baru aman
      return ok(
        response,
        { data: items, subtotal, meta }, // serve (kompat lama)
        200,
        'success',
        {
          // format baru
          data: items,
          subtotal,
          meta,
        }
      )
    } catch (error: any) {
      return fail(response, 500, error?.message || 'Internal Server Error.', [])
    }
  }

  public async create(ctx: HttpContext) {
    const { response, request, auth } = ctx
    try {
      const userId = await this.resolveUserId(ctx)
      if (!userId) return fail(response, 401, 'Unauthenticated', null)

      const result = await this.cartService.addToCart(userId, {
        product_id: request.input('product_id'),
        variant_id: request.input('variant_id'),
        qty: request.input('qty'),
        is_buy_now: request.input('is_buy_now'),
        attributes: request.input('attributes') || [],
      })

      return ok(response, result.serve, result.httpStatus || 200, result.message)
    } catch (error: any) {
      const status = Number(error?.httpStatus) || 500
      return fail(response, status, error?.message || 'Internal Server Error.', [])
    }
  }

  public async update(ctx: HttpContext) {
    const { response, request, auth, params } = ctx
    try {
      const userId = await this.resolveUserId(ctx)
      if (!userId) return fail(response, 401, 'Unauthenticated', null)

      const id = Number(params?.id ?? request.input('id'))
      const qty = Number(request.input('qty'))

      const result = await this.cartService.updateQty(userId, id, qty)
      return ok(response, result.serve, result.httpStatus || 200, result.message)
    } catch (error: any) {
      const status = Number(error?.httpStatus) || 500
      return fail(response, status, error?.message || 'Internal Server Error.', [])
    }
  }

  public async updateSelection(ctx: HttpContext) {
    const { response, request, auth } = ctx
    try {
      const userId = await this.resolveUserId(ctx)
      if (!userId) return fail(response, 401, 'Unauthenticated', null)

      const rawIds = request.input('cart_ids') ?? request.input('cartIds') ?? []
      const ids = parseCartIds(rawIds)

      const isCheckout = parseIsCheckout(request.input('is_checkout'), request.input('isCheckout'))
      if (isCheckout === null) return fail(response, 400, 'is_checkout invalid', null)

      // FE kamu call 2x (selected & unselected), kalau kosong jangan error
      if (!ids.length) {
        return ok(response, { affected: 0 }, 200, 'Cart selection updated', { data: { affected: 0 } })
      }

      const result = await this.cartService.updateSelection(userId, ids, isCheckout)

      const payload = result?.serve ?? result ?? null
      return ok(response, payload, 200, result?.message || 'Cart selection updated', { data: payload })
    } catch (error: any) {
      return fail(response, 500, error?.message || 'Internal Server Error.', [])
    }
  }

  public async miniCart(ctx: HttpContext) {
    const { response, auth, request } = ctx
    try {
      const userId = await this.resolveUserId(ctx)
      if (!userId) return fail(response, 401, 'Unauthenticated', null)

      const result = await this.cartService.miniCart(userId, request)
      // result: { message, serve: { data, subtotal } }
      return ok(response, result.serve, 200, result.message)
    } catch (error: any) {
      return fail(response, 500, error?.message || 'Internal Server Error.', [])
    }
  }

  public async delete(ctx: HttpContext) {
    const { response, request, auth, params } = ctx
    try {
      const userId = await this.resolveUserId(ctx)
      if (!userId) return fail(response, 401, 'Unauthenticated', null)

      const id = Number(params?.id ?? request.input('id'))
      const result = await this.cartService.deleteItem(userId, id)

      return ok(response, result.serve, result.httpStatus || 200, result.message)
    } catch (error: any) {
      const status = Number(error?.httpStatus) || 500
      return fail(response, status, error?.message || 'Internal Server Error.', [])
    }
  }
}
