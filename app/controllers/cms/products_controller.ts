import type { HttpContext } from '@adonisjs/core/http'
import Product from '#models/product'
import db from '@adonisjs/lucid/services/db'
import { create } from '#validators/product'
import ProductMedia from '#models/product_media'
import ProductVariant from '#models/product_variant'
import ProductDiscount from '#models/product_discount'
import VariantAttribute from '#models/variant_attribute'
import emitter from '@adonisjs/core/services/emitter'
import env from '#start/env'
import OpenAI from 'openai'

export default class ProductsController {
    public async get({ response, request }: HttpContext) {
    try {
      const { name = '', isFlashsale, page: p, per_page: pp } = request.qs()
      const page = Number(p) > 0 ? Number(p) : 1
      const per_page = Number(pp) > 0 ? Number(pp) : 10

      const dataProduct = await Product.query()
        .apply((scopes) => scopes.active())
        .if(name, (q) => q.where('products.name', 'like', `%${name}%`))
        .if(isFlashsale !== undefined && isFlashsale !== '', (q) =>
          q.where('products.is_flashsale', Number(isFlashsale))
        )
        .preload('variants', (variantLoader) => {
          // Sesuaikan jika Abby punya struktur atribut berbeda
          variantLoader.preload('attributes', (attributeLoader) => {
            attributeLoader
              .whereNull('attribute_values.deleted_at')
              .preload('attribute', (query) => query.whereNull('attributes.deleted_at'))
          })
        })
        .preload('discounts')
        .preload('medias')
        .preload('tag')
        .preload('subTag')
        .preload('detailSubTag')
        .preload('categoryType')
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
              .preload('attribute', (query) => query.whereNull('attributes.deleted_at'))
          })
        })
        .preload('discounts')
        .preload('medias')
        .preload('tag')
        .preload('subTag')
        .preload('detailSubTag')
        .preload('categoryType')
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

  public async create({ response, request, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const data = request.all()
      try {
        await create.validate(data)
      } catch (err) {
        await trx.commit()
        return response.status(422).send({
          message:
            err.messages?.length > 0
              ? err.messages?.map((v: { message: string }) => v.message).join(',')
              : 'Validation error.',
          serve: [],
        })
      }

      const dataProduct = new Product()
      dataProduct.name = request.input('name')
      const existsPath = await Product.query().where(
        'path',
        request
          .input('name')
          .replace(/[^a-zA-Z0-9_ -]/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase()
      )

      if (existsPath.length > 0) {
        const pathRegex = request
          .input('name')
          .replace(/[^a-zA-Z0-9_ -]/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase()
        const path = `${pathRegex}-${existsPath.length + 1}`
        dataProduct.path = path
      } else {
        const path = request
          .input('name')
          .replace(/[^a-zA-Z0-9_ -]/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase()
        dataProduct.path = path
      }
      dataProduct.description = request.input('description')
      dataProduct.weight = request.input('weight')
      dataProduct.basePrice = request.input('base_price')
      dataProduct.isFlashsale = request.input('status')
      dataProduct.tagId = request.input('tag_id')
      dataProduct.subTagId = request.input('sub_tag_id')
      dataProduct.detailSubTagId = request.input('detail_sub_tag_id')
      dataProduct.categoryTypeId = request.input('category_type_id')

      if (request.input('meta_ai') === 1) {
        const meta = await this.generateMeta({
          productName: request.input('name'),
          productDescription: request.input('description'),
        })

        if (meta) {
          dataProduct.metaTitle = meta?.metaTitle
          dataProduct.metaDescription = meta?.metaDescription
          dataProduct.metaKeywords = meta?.metaKeywords
        }
      } else {
        dataProduct.metaTitle = request.input('meta_title')
        dataProduct.metaDescription = request.input('meta_description')
        dataProduct.metaKeywords = request.input('meta_keywords')
      }

      await dataProduct.save()

      if (request.input('medias')?.length > 0) {
        for (const value of request.input('medias')) {
          const urlParts = value.url.split('/')
          const fileNameWithQuery = urlParts[urlParts.length - 1]
          const fileName = fileNameWithQuery.split('?')[0]
          await ProductMedia.create({
            productId: dataProduct.id,
            url: fileName,
            type: value.type,
            altText: dataProduct.name,
          })
        }
      }

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

      if (request.input('variants')?.length > 0) {
        for (const value of request.input('variants')) {
          let sku = value.sku
          let existingVariant = await ProductVariant.query().where('sku', sku).first()
          let counter = 1

          // Tambahkan format (n) jika SKU sudah ada
          while (existingVariant) {
            counter++
            sku = `${value.sku}(${counter})`
            existingVariant = await ProductVariant.query().where('sku', sku).first()
          }
          const createdVariant = await ProductVariant.create({
            productId: dataProduct.id,
            sku: sku,
            barcode: this.generateBarcode(dataProduct.id, Math.floor(100 + Math.random() * 900)),
            price: value.price?.replace(/\./g, ''),
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
        message: 'Sucessfully created.',
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

  public async update({ response, request, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const data = request.all()
      try {
        await create.validate(data)
      } catch (err) {
        await trx.commit()
        return response.status(422).send({
          message:
            err.messages?.length > 0
              ? err.messages?.map((v: { message: string }) => v.message).join(',')
              : 'Validation error.',
          serve: [],
        })
      }

      const dataProduct = await Product.query().where('id', request.input('id')).first()
      if (!dataProduct) {
        return response.status(400).send({
          message: 'Invalid data.',
          serve: [],
        })
      }

      const oldData = dataProduct.toJSON()

      if (dataProduct.name !== request.input('name')) {
        const existsPath = await Product.query().where(
          'path',
          request
            .input('name')
            .replace(/[^a-zA-Z0-9_ -]/g, '')
            .replace(/\s+/g, '-')
            .toLowerCase()
        )

        if (existsPath.length > 0) {
          const pathRegex = request
            .input('name')
            .replace(/[^a-zA-Z0-9_ -]/g, '')
            .replace(/\s+/g, '-')
            .toLowerCase()
          const path = `${pathRegex}-${existsPath.length + 1}`
          dataProduct.path = path
        } else {
          const path = request
            .input('name')
            .replace(/[^a-zA-Z0-9_ -]/g, '')
            .replace(/\s+/g, '-')
            .toLowerCase()
          dataProduct.path = path
        }
      }

      if (request.input('meta_ai') === 1) {
        if (dataProduct.description !== request.input('description')) {
          const meta = await this.generateMeta({
            productName: request.input('name'),
            productDescription: request.input('description'),
          })

          if (meta) {
            dataProduct.metaTitle = meta?.metaTitle
            dataProduct.metaDescription = meta?.metaDescription
            dataProduct.metaKeywords = meta?.metaKeywords
          }
        }
      } else {
        dataProduct.metaTitle = request.input('meta_title')
        dataProduct.metaDescription = request.input('meta_description')
        dataProduct.metaKeywords = request.input('meta_keywords')
      }

      dataProduct.name = request.input('name')
      dataProduct.description = request.input('description')
      dataProduct.weight = request.input('weight')
      dataProduct.basePrice = request.input('base_price')
      dataProduct.isFlashsale = request.input('status')
      dataProduct.sizeChartId = request.input('size_chart_id')
      dataProduct.tagId = request.input('tag_id')
      dataProduct.subTagId = request.input('sub_tag_id')
      dataProduct.detailSubTagId = request.input('detail_sub_tag_id')
      dataProduct.categoryTypeId = request.input('category_type_id')
      await dataProduct.save()

      if (request.input('variants')?.length > 0) {
        await ProductVariant.query().where('product_id', dataProduct.id).delete()
        for (const value of request.input('variants')) {
          let sku = value.sku
          let existingVariant = await ProductVariant.query().where('sku', sku).first()
          let counter = 1

          // Tambahkan format (n) jika SKU sudah ada
          while (existingVariant) {
            counter++
            sku = `${value.sku}(${counter})`
            existingVariant = await ProductVariant.query().where('sku', sku).first()
          }
          const createdVariant = await ProductVariant.create({
            productId: dataProduct.id,
            sku: sku,
            barcode: this.generateBarcode(dataProduct.id, Math.floor(100 + Math.random() * 900)),
            price: value.price?.replace(/\./g, ''),
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

      if (request.input('medias')?.length > 0) {
        await ProductMedia.query().where('product_id', dataProduct.id).delete()
        for (const value of request.input('medias')) {
          const urlParts = value.url.split('/')
          const fileNameWithQuery = urlParts[urlParts.length - 1]
          const fileName = fileNameWithQuery.split('?')[0]
          await ProductMedia.create({
            productId: dataProduct.id,
            url: fileName,
            type: value.type,
            altText: dataProduct.name,
          })
        }
      }

      if (request.input('discounts')?.length > 0) {
        await ProductDiscount.query().where('product_id', dataProduct.id).delete()
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
        message: 'Sucessfully updated.',
        serve: dataProduct,
      })
    } catch (error) {
      await trx.rollback()
      console.log(error)
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async delete({ response, request, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const size = await Product.query().where('id', request.input('id')).first()
      if (size) {
        await size.softDelete()

        // @ts-ignore
        await emitter.emit('set:activity-log', {
          roleName: auth.user?.role_name,
          userName: auth.user?.name,
          activity: `Delete Product`,
          menu: 'Product',
          data: size.toJSON(),
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

  // Fungsi untuk mendapatkan tanggal dalam format dd/mm/yy
  private getFormattedDate() {
    const today = new Date()
    const dd = String(today.getDate()).padStart(2, '0')
    const mm = String(today.getMonth() + 1).padStart(2, '0') // Bulan dimulai dari 0
    const yy = String(today.getFullYear()).slice(-2)
    return `${dd}${mm}${yy}`
  }

  // Fungsi untuk membuat kode barcode
  private generateBarcode(kodeKatalog: number, increment: number) {
    const datePart = this.getFormattedDate()
    const incrementPart = String(increment).padStart(5, '0') // Format increment menjadi 5 digit
    return `${datePart}${kodeKatalog}${incrementPart}`
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

    if (!productName || !productDescription) {
      return false
    }

    try {
      // Prompt untuk OpenAI
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

      // Menggunakan OpenAI API
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      })

      // Parsing hasil dari OpenAI
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

  public async getIsFlashsale({ response }: HttpContext) {
    try {
      const dataProduct = await Product.query()
        .apply((scopes) => scopes.active())
        .where('is_flashsale', 1)
        .orderBy('products.created_at', 'desc')

      return response.status(200).send({
        message: 'success',
        serve: dataProduct.map((p) => p.toJSON()),
      })
    } catch (error) {
      console.log('E', error)
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async updateProductIndex({ request, response }: HttpContext) {
  try {
    const { orders } = request.only(['orders'])  // ✅ ambil array orders

    if (!orders || !Array.isArray(orders)) {
      return response.status(400).send({
        message: 'Orders must be an array',
        serve: [],
      })
    }

    for (const order of orders) {
      await Product.query()
        .where('id', order.id)
        .update({ position: order.position })
    }

    return response.status(200).send({
      message: 'Successfully updated product order',
      serve: orders,
    })
  } catch (error) {
    return response.status(500).send({
      message: error.message || 'Internal Server Error.',
      serve: [],
    })
  }
}


}