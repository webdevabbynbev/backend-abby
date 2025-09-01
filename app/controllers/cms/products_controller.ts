import type { HttpContext } from '@adonisjs/core/http'
import Product from '#models/product'
import db from '@adonisjs/lucid/services/db'
import { createProduct, updateProduct } from '#validators/product'
import ProductMedia from '#models/product_media'
import ProductVariant from '#models/product_variant'
import ProductDiscount from '#models/product_discount'
import VariantAttribute from '#models/variant_attribute'
import emitter from '@adonisjs/core/services/emitter'
import env from '#start/env'
import OpenAI from 'openai'
import { generateSlug } from '../../utils/helpers.js'
import CategoryType from '#models/category_type'

export default class ProductsController {
  /**
   * List product with pagination + filter
   */
  public async get({ response, request }: HttpContext) {
    try {
      const { name = '', isFlashsale, status, page: p, per_page: pp } = request.qs()
      const page = Number(p) > 0 ? Number(p) : 1
      const per_page = Number(pp) > 0 ? Number(pp) : 10

      const dataProduct = await Product.query()
        .apply((scopes) => scopes.active())
        .if(name, (q) => q.where('products.name', 'like', `%${name}%`))
        .if(isFlashsale !== undefined && isFlashsale !== '', (q) =>
          q.where('products.is_flashsale', Boolean(Number(isFlashsale)))
        )
        .if(status, (q) => q.where('products.status', status)) // ✅ filter status
        .preload('variants', (variantLoader) => {
          variantLoader.preload('attributes', (attributeLoader) => {
            attributeLoader
              .whereNull('attribute_values.deleted_at')
              .preload('attribute', (q) => q.whereNull('attributes.deleted_at'))
          })
        })
        .preload('discounts')
        .preload('medias')
        .preload('categoryType')
        .preload('brand')
        .preload('persona')
        .preload('tags')
        .preload('concerns')
        .orderByRaw('products.position IS NULL, products.position ASC')
        .paginate(page, per_page)

      const { meta, data } = dataProduct.toJSON()

      return response.status(200).send({
        message: 'success',
        serve: {
          data,
          ...meta,
        },
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  /**
   * Show detail product by id
   */
  public async show({ response, params }: HttpContext) {
    try {
      const productId = params.id
      const dataProduct = await Product.query()
        .apply((scopes) => scopes.active())
        .where('id', productId)
        .preload('variants', (variantLoader) => {
          variantLoader.preload('attributes', (attributeLoader) => {
            attributeLoader
              .whereNull('attribute_values.deleted_at')
              .preload('attribute', (q) => q.whereNull('attributes.deleted_at'))
          })
        })
        .preload('discounts')
        .preload('medias')
        .preload('categoryType')
        .preload('brand')
        .preload('persona')
        .preload('tags')
        .preload('concerns')
        .first()

      if (!dataProduct) {
        return response.status(404).send({
          message: 'Product not found',
          serve: null,
        })
      }

      return response.status(200).send({
        message: 'success',
        serve: dataProduct,
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  /**
   * Create product
   */
  public async create({ response, request, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const data = request.all()
      await createProduct.validate(data)

      const dataProduct = new Product()
      dataProduct.name = request.input('name')
      dataProduct.slug = await generateSlug(request.input('name'))
      dataProduct.description = request.input('description')
      dataProduct.weight = request.input('weight')
      dataProduct.basePrice = request.input('base_price')

      // ✅ handle status + is_flashsale
      dataProduct.status = request.input('status') || 'draft'
      dataProduct.isFlashsale =
        dataProduct.status === 'draft' ? false : request.input('is_flashsale') || false

      dataProduct.categoryTypeId = request.input('category_type_id')
      dataProduct.brandId = request.input('brand_id')
      dataProduct.personaId = request.input('persona_id')

      // ✅ Generate path
      const category = await CategoryType.find(request.input('category_type_id'))
      const categorySlug = category
        ? await generateSlug(category.name) // <-- pakai await
        : `category-${request.input('category_type_id')}`

      dataProduct.path = `${categorySlug}/${dataProduct.slug}`

      // SEO
      if (request.input('meta_ai') === 1) {
        const meta = await this.generateMeta({
          productName: request.input('name'),
          productDescription: request.input('description'),
        })
        if (meta) {
          dataProduct.metaTitle = meta.metaTitle
          dataProduct.metaDescription = meta.metaDescription
          dataProduct.metaKeywords = meta.metaKeywords
        }
      } else {
        dataProduct.metaTitle = request.input('meta_title')
        dataProduct.metaDescription = request.input('meta_description')
        dataProduct.metaKeywords = request.input('meta_keywords')
      }

      await dataProduct.save()

      // Tags & Concerns
      if (request.input('tag_ids')?.length > 0) {
        await dataProduct.related('tags').sync(request.input('tag_ids'))
      }
      if (request.input('concern_ids')?.length > 0) {
        await dataProduct.related('concerns').sync(request.input('concern_ids'))
      }

      // Medias
      if (request.input('medias')?.length > 0) {
        for (const value of request.input('medias')) {
          await ProductMedia.create({
            productId: dataProduct.id,
            url: this.extractFileName(value.url),
            type: value.type,
            altText: dataProduct.name,
          })
        }
      }

      // Discounts
      if (request.input('discounts')?.length > 0) {
        for (const value of request.input('discounts')) {
          await ProductDiscount.create({
            productId: dataProduct.id,
            type: value.type,
            value: value.value,
            maxValue: value.max_value,
            startDate: value.start_date,
            endDate: value.end_date,
          })
        }
      }

      // Variants
      if (request.input('variants')?.length > 0) {
        for (const value of request.input('variants')) {
          let sku = await this.ensureUniqueSku(value.sku)
          const createdVariant = await ProductVariant.create({
            productId: dataProduct.id,
            sku: sku,
            barcode: this.generateBarcode(dataProduct.id, Math.floor(100 + Math.random() * 900)),
            price: value.price,
            stock: value.stock,
          })

          if (value.combination?.length > 0) {
            for (const attribute of value.combination) {
              await VariantAttribute.create({
                productVariantId: createdVariant.id,
                attributeValueId: attribute,
              })
            }
          }
        }
      }

      // Log
      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Create Product`,
        menu: 'Product',
        data: dataProduct.toJSON(),
      })

      await trx.commit()
      return response.status(200).send({
        message: 'Successfully created.',
        serve: dataProduct,
      })
    } catch (error) {
      await trx.rollback()
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  /**
   * Update product
   */
  public async update({ response, request, params, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const data = request.all()
      await updateProduct.validate(data)

      const dataProduct = await Product.find(params.id)
      if (!dataProduct) {
        return response.status(400).send({
          message: 'Invalid data.',
          serve: [],
        })
      }

      const oldData = dataProduct.toJSON()

      dataProduct.name = request.input('name')
      dataProduct.slug = await generateSlug(request.input('name'))
      dataProduct.description = request.input('description')
      dataProduct.weight = request.input('weight')
      dataProduct.basePrice = request.input('base_price')

      // ✅ update status & is_flashsale
      dataProduct.status = request.input('status') || dataProduct.status
      dataProduct.isFlashsale =
        dataProduct.status === 'draft' ? false : request.input('is_flashsale') || false

      dataProduct.categoryTypeId = request.input('category_type_id')
      dataProduct.brandId = request.input('brand_id')
      dataProduct.personaId = request.input('persona_id')

      // ✅ Generate path
      const category = await CategoryType.find(request.input('category_type_id'))
      const categorySlug = category
        ? await generateSlug(category.name) // <-- pakai await
        : `category-${request.input('category_type_id')}`

      dataProduct.path = `${categorySlug}/${dataProduct.slug}`

      await dataProduct.save()

      // Tags & Concerns
      if (request.input('tag_ids')?.length > 0) {
        await dataProduct.related('tags').sync(request.input('tag_ids'))
      }
      if (request.input('concern_ids')?.length > 0) {
        await dataProduct.related('concerns').sync(request.input('concern_ids'))
      }

      // Medias, Variants, Discounts bisa diupdate sesuai logic kamu...

      // Log
      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Product`,
        menu: 'Product',
        data: { old: oldData, new: dataProduct.toJSON() },
      })

      await trx.commit()
      return response.status(200).send({
        message: 'Successfully updated.',
        serve: dataProduct,
      })
    } catch (error) {
      await trx.rollback()
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  /**
   * Delete product (soft delete)
   */
  public async delete({ response, params, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const product = await Product.find(params.id)
      if (product) {
        await product.softDelete()

        // Log
        // @ts-ignore
        await emitter.emit('set:activity-log', {
          roleName: auth.user?.role_name,
          userName: auth.user?.name,
          activity: `Delete Product`,
          menu: 'Product',
          data: product.toJSON(),
        })

        await trx.commit()
        return response.status(200).send({
          message: 'Successfully deleted.',
          serve: [],
        })
      } else {
        await trx.commit()
        return response.status(422).send({
          message: 'Invalid data.',
          serve: [],
        })
      }
    } catch (error) {
      await trx.rollback()
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  // helpers ...
  private extractFileName(url: string) {
    const urlParts = url.split('/')
    const fileNameWithQuery = urlParts[urlParts.length - 1]
    return fileNameWithQuery.split('?')[0]
  }

  private async ensureUniqueSku(baseSku: string) {
    let sku = baseSku
    let existing = await ProductVariant.query().where('sku', sku).first()
    let counter = 1
    while (existing) {
      counter++
      sku = `${baseSku}-${counter}`
      existing = await ProductVariant.query().where('sku', sku).first()
    }
    return sku
  }

  private getFormattedDate() {
    const today = new Date()
    const dd = String(today.getDate()).padStart(2, '0')
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const yy = String(today.getFullYear()).slice(-2)
    return `${dd}${mm}${yy}`
  }

  private async generateMeta({
    productName,
    productDescription,
  }: {
    productName: string
    productDescription: string
  }) {
    const openai = new OpenAI({
      apiKey: env.get('OPENAI_API_KEY'),
    })

    if (!productName || !productDescription) return false

    try {
      const prompt = `
        Generate SEO meta tags for the following product with Indonesian language:
        Product Name: ${productName}
        Product Description: ${productDescription}

        Provide the result in this JSON format:
        {
          "metaTitle": "SEO optimized title",
          "metaDescription": "SEO optimized description",
          "metaKeywords": "comma-separated keywords"
        }
      `
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      })
      const result = JSON.parse(completion.choices[0].message.content || '{}')
      return {
        metaTitle: result.metaTitle,
        metaDescription: result.metaDescription,
        metaKeywords: result.metaKeywords,
      }
    } catch (error) {
      console.error('Error generating meta tags:', error)
      return false
    }
  }

  private generateBarcode(kodeKatalog: number, increment: number) {
    const datePart = this.getFormattedDate()
    const incrementPart = String(increment).padStart(5, '0')
    return `${datePart}${kodeKatalog}${incrementPart}`
  }

  /**
   * List only flashsale products
   */
  public async getIsFlashsale({ response }: HttpContext) {
    try {
      const dataProduct = await Product.query()
        .apply((scopes) => scopes.active())
        .where('is_flashsale', true)
        .where('status', '!=', 'draft')
        .orderBy('products.created_at', 'desc')

      return response.status(200).send({
        message: 'success',
        serve: dataProduct.map((p) => p.toJSON()),
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async updateProductIndex({ request, response }: HttpContext) {
    const updates = request.input('updates') // Mengambil array dari request
    const batchSize = 100 // Ukuran batch yang diinginkan

    try {
      // Update posisi berdasarkan payload
      for (const update of updates) {
        const { id, order: newPosition } = update

        await Product.query().where('id', id).update({ position: newPosition })
      }

      // Reorder seluruh data produk dalam batch
      let page = 1
      let hasMore = true

      while (hasMore) {
        const products = await Product.query().orderBy('position', 'asc').paginate(page, batchSize)

        if (products.all().length === 0) {
          hasMore = false
          break
        }

        for (let i = 0; i < products.all().length; i++) {
          const product = products.all()[i]
          const newPosition = (page - 1) * batchSize + i
          if (product.position !== newPosition) {
            await Product.query().where('id', product.id).update({ position: newPosition })
          }
        }

        page++
      }

      return response.status(200).send({
        message: 'Positions updated and reordered successfully.',
        serve: [],
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }
}
