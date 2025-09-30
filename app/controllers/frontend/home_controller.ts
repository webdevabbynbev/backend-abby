import type { HttpContext } from '@adonisjs/core/http'
import Banner from '#models/banner'
import Setting from '#models/setting'
import { SettingType } from '../../enums/setting_types.js'
import Faq from '#models/faq'
import FlashSale from '#models/flashsale'
import { DateTime } from 'luxon'

export default class HomeController {
  public async getBanner({ response }: HttpContext) {
    try {
      const banners = await Banner.query()
        .apply((s) => s.active())
        .orderBy('order', 'asc')

      return response.status(200).send({
        message: 'Success',
        serve: banners,
      })
    } catch (e) {
      console.error(e)
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  public async getTermAndCondition({ response }: HttpContext) {
    const termAndCondition = await Setting.query()
      .select('key', 'value', 'createdAt', 'updatedAt')
      .where('key', SettingType.TERM_AND_CONDITIONS)
      .first()

    return response.status(200).send({
      message: 'Success',
      serve: termAndCondition,
    })
  }

  public async getReturnPolicy({ response }: HttpContext) {
    const returnPolicy = await Setting.query()
      .select('key', 'value', 'createdAt', 'updatedAt')
      .where('key', SettingType.RETURN_POLICY)
      .first()

    return response.status(200).send({
      message: 'Success',
      serve: returnPolicy,
    })
  }

  public async getPrivacyPolicy({ response }: HttpContext) {
    const returnPrivacyPolicy = await Setting.query()
      .select('key', 'value', 'createdAt', 'updatedAt')
      .where('key', SettingType.PRIVACY_POLICY)
      .first()

    return response.status(200).send({
      message: 'Success',
      serve: returnPrivacyPolicy,
    })
  }

  public async getContactSupport({ response }: HttpContext) {
    const returnContactSupport = await Setting.query()
      .select('key', 'value', 'createdAt', 'updatedAt')
      .where('key', SettingType.CONTACT_US)
      .first()

    return response.status(200).send({
      message: 'Success',
      serve: returnContactSupport,
    })
  }

  public async getFaq({ response }: HttpContext) {
    try {
      const faqs = await Faq.query().select('question', 'answer')

      return response.status(200).send({
        message: 'Success',
        serve: faqs.map((f) => ({
          question: f.question,
          answer: f.answer,
        })),
      })
    } catch (e) {
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  public async getAboutUs({ response }: HttpContext) {
    const returnContactSupport = await Setting.query()
      .select('key', 'value', 'createdAt', 'updatedAt')
      .where('key', SettingType.ABOUT_US)
      .first()

    return response.status(200).send({
      message: 'Success',
      serve: returnContactSupport,
    })
  }

  public async getFlashSale({ response }: HttpContext) {
    try {
      const now = DateTime.now()

      const flashSale = await FlashSale.query()
        .where('is_publish', true)
        .where('start_datetime', '<=', now.toSQL())
        .where('end_datetime', '>=', now.toSQL())
        .preload('products', (q) => {
          q.pivotColumns(['flash_price', 'stock'])
          q.preload('medias')
        })
        .first()

      if (!flashSale) {
        return response.status(200).send({
          message: 'No active flash sale',
          serve: null,
        })
      }

      return response.status(200).send({
        message: 'Success',
        serve: {
          id: flashSale.id,
          title: flashSale.title,
          description: flashSale.description,
          hasButton: flashSale.hasButton,
          buttonText: flashSale.buttonText,
          buttonUrl: flashSale.buttonUrl,
          startDatetime: flashSale.startDatetime,
          endDatetime: flashSale.endDatetime,
          products: flashSale.products.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.basePrice,
            flashPrice: p.$extras.pivot_flash_price,
            stock: p.$extras.pivot_stock,
            image: p.medias.length ? p.medias[0].url : null,
          })),
        },
      })
    } catch (e) {
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }
}
