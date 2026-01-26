import type { HttpContext } from '@adonisjs/core/http'
import emitter from '@adonisjs/core/services/emitter'

import { createProduct, updateProduct } from '#validators/product'
import { ProductService } from '#services/product/product_service'
import { ProductCmsService } from '#services/product/product_cms_service'
import type { CmsProductUpsertPayload } from '#services/product/product_cms_service'

import ProductMedia from '#models/product_media'
import ProductVariant from '#models/product_variant'

import FileUploadService from '#utils/upload_file_service'

export default class ProductsController {
  private productService = new ProductService()
  private cms = new ProductCmsService()

  public async get({ response, request }: HttpContext) {
    try {
      const qs = request.qs()
      const keyword = String(qs.q || qs.name || '').trim()

      const isFlashsale = qs.isFlashsale
      const status = qs.status

      const page = Number(qs.page) > 0 ? Number(qs.page) : 1
      const per_page = Number(qs.per_page) > 0 ? Number(qs.per_page) : 10

      const dataProduct = await this.productService
        .query()
        .apply((scopes) => scopes.active())
        .if(keyword, (query) => {
          query.where((subQuery) => {
            subQuery
              .where('products.name', 'like', `%${keyword}%`)
              .orWhere('products.slug', 'like', `%${keyword}%`)
              .orWhere('products.master_sku', 'like', `%${keyword}%`)
              .orWhereHas('variants', (vq) => {
                vq.where('sku', 'like', `%${keyword}%`).orWhere('barcode', 'like', `%${keyword}%`)
              })
              .orWhereHas('brand', (bq) => {
                bq.whereILike('name', `%${keyword}%`)
              })
          })
        })
        .if(isFlashsale !== undefined && isFlashsale !== '', (q) =>
          q.where('products.is_flashsale', Boolean(Number(isFlashsale)))
        )
        .if(status, (q) => q.where('products.status', status))
        .preload('variants', (variantLoader) => {
          variantLoader
            .preload('medias', (mq) => {
              mq.apply((scopes) => scopes.active())
              mq.orderBy('slot', 'asc')
            })
            .preload('attributes', (aq) => {
              aq.apply((scopes) => scopes.active()).preload('attribute', (atq) =>
                atq.apply((scopes) => scopes.active())
              )
            })
        })
        .preload('discounts')
        .preload('medias')
        .preload('categoryType')
        .preload('brand')
        .preload('persona')
        .preload('tags')
        .preload('concernOptions')
        .preload('profileOptions')

        .orderByRaw('products.position IS NULL, products.position ASC')
        .orderBy('products.name', 'asc')
        .orderBy('products.id', 'asc')
        .paginate(page, per_page)

      const { meta, data } = dataProduct.toJSON()

      return response.status(200).send({
        message: 'success',
        serve: { data, ...meta },
      })
    } catch (error: any) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async show({ response, params }: HttpContext) {
    try {
      const productId = params.id

      const dataProduct = await this.productService
        .query()
        .apply((scopes) => scopes.active())
        .where('id', productId)
        .preload('variants', (variantLoader) => {
          variantLoader
            .preload('medias', (mq) => {
              mq.apply((scopes) => scopes.active())
              mq.orderBy('slot', 'asc')
            })
            .preload('attributes', (aq) => {
              aq.apply((scopes) => scopes.active()).preload('attribute', (atq) =>
                atq.apply((scopes) => scopes.active())
              )
            })
        })
        .preload('discounts')
        .preload('medias')
        .preload('categoryType')
        .preload('brand')
        .preload('persona')
        .preload('tags')
        .preload('concernOptions')
        .preload('profileOptions')
        .first()

      if (!dataProduct) {
        return response.status(404).send({ message: 'Product not found', serve: null })
      }

      return response.status(200).send({ message: 'success', serve: dataProduct })
    } catch (error: any) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async create({ response, request, auth }: HttpContext) {
    try {
      const data = request.all() as unknown as CmsProductUpsertPayload
      await createProduct.validate(data)

      const created = await this.cms.create(data)

      await (emitter as any).emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: 'Create Product',
        menu: 'Product',
        data: created.toJSON(),
      })

      return response.status(200).send({ message: 'Successfully created.', serve: created })
    } catch (error: any) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async update({ response, request, params, auth }: HttpContext) {
    try {
      const data = request.all() as unknown as CmsProductUpsertPayload
      await updateProduct.validate(data)

      const before = await this.productService.find(Number(params.id))
      if (!before) return response.status(400).send({ message: 'Invalid data.', serve: [] })

      const oldData = before.toJSON()
      const updated = await this.cms.update(Number(params.id), data)

      if (!updated) return response.status(400).send({ message: 'Invalid data.', serve: [] })

      await (emitter as any).emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: 'Update Product',
        menu: 'Product',
        data: { old: oldData, new: updated.toJSON() },
      })

      return response.status(200).send({ message: 'Successfully updated.', serve: updated })
    } catch (error: any) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async delete({ response, params, auth }: HttpContext) {
    try {
      const product = await this.cms.softDelete(Number(params.id))
      if (!product) return response.status(422).send({ message: 'Invalid data.', serve: [] })

      await (emitter as any).emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: 'Delete Product',
        menu: 'Product',
        data: product.toJSON(),
      })

      return response.status(200).send({ message: 'Successfully deleted.', serve: [] })
    } catch (error: any) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  /**
   * Upload single media (product-level atau variant-level)
   * - slot wajib
   * - kalau variant_id dikirim: nama file S3 = barcode (slot1) / barcode-slot (slot2..n)
   */
  public async uploadMedia({ request, params, response }: HttpContext) {
    try {
      const productId = Number(params.id)
      if (!productId) return response.badRequest({ message: 'Invalid product id', serve: null })

      const slot = String(request.input('slot') || '').trim()
      if (!slot) return response.badRequest({ message: 'slot wajib diisi', serve: null })

      const type = Number(request.input('type') || 1)
      const variantId = request.input('variant_id') ? Number(request.input('variant_id')) : null
      const altText = String(request.input('alt_text') || '')

      const file = (request as any).file('file', {
        size: '10mb',
        extnames: ['jpg', 'jpeg', 'png', 'webp'],
      })

      if (!file) return response.badRequest({ message: 'file wajib', serve: null })
      if (file.isValid === false) {
        return response.badRequest({ message: 'file tidak valid', serve: file.errors })
      }

      const folder = `products/${productId}`
      let url: string

      // Kalau attach ke variant: pakai barcode sebagai publicId agar nama file match barcode
      if (variantId) {
        const variant = await ProductVariant.query()
          .where('id', variantId)
          .where('product_id', productId)
          .first()

        if (!variant) {
          return response.badRequest({ message: 'variant_id tidak ditemukan untuk product ini', serve: null })
        }

        const barcode = String((variant as any).barcode || '').trim()
        if (!barcode) {
          return response.badRequest({ message: 'Variant tidak punya barcode', serve: null })
        }

        const publicId = slot === '1' ? barcode : `${barcode}-${slot}`
        url = await (FileUploadService as any).uploadFile(file, { folder }, { publicId })
      } else {
        url = await (FileUploadService as any).uploadFile(file, { folder })
      }

      const media = await ProductMedia.create({
        productId, // ✅ penting biar nempel ke product juga
        variantId,
        url,
        altText,
        type,
        slot,
      })

      return response.status(200).send({ message: 'success', serve: media })
    } catch (error: any) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: null,
      })
    }
  }

  /**
   * Upload multiple medias untuk variant
   * slot auto 1..n
   * nama file S3 = barcode (slot1) / barcode-slot (slot2..n)
   */
  public async uploadMediaBulk({ request, params, response }: HttpContext) {
    try {
      const productId = Number(params.id)
      if (!productId) return response.badRequest({ message: 'Invalid product id', serve: null })

      const type = Number(request.input('type') || 1)
      const variantId = request.input('variant_id') ? Number(request.input('variant_id')) : null
      if (!variantId) return response.badRequest({ message: 'variant_id wajib diisi', serve: null })

      const files = (request as any).files('files', {
        size: '10mb',
        extnames: ['jpg', 'jpeg', 'png', 'webp'],
      }) as any[]

      if (!files || files.length === 0) {
        return response.badRequest({ message: 'files wajib diisi', serve: null })
      }

      for (const f of files) {
        if (f?.isValid === false) {
          return response.badRequest({ message: 'Ada file yang tidak valid', serve: f.errors })
        }
      }

      const variant = await ProductVariant.query()
        .where('id', variantId)
        .where('product_id', productId)
        .first()

      if (!variant) {
        return response.badRequest({ message: 'variant_id tidak ditemukan untuk product ini', serve: null })
      }

      const barcode = String((variant as any).barcode || '').trim()
      if (!barcode) {
        return response.badRequest({ message: 'Variant tidak punya barcode', serve: null })
      }

      const folder = `products/${productId}/variant-${variantId}`
      const created: ProductMedia[] = []

      for (let i = 0; i < files.length; i++) {
        const slot = String(i + 1)
        const publicId = slot === '1' ? barcode : `${barcode}-${slot}`

        const url = await (FileUploadService as any).uploadFile(files[i], { folder }, { publicId })

        const media = await ProductMedia.create({
          productId, // ✅ penting biar nempel ke product juga
          variantId,
          url,
          altText: '',
          type,
          slot,
        })

        created.push(media)
      }

      return response.status(200).send({ message: 'success', serve: created })
    } catch (error: any) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: null,
      })
    }
  }
}
