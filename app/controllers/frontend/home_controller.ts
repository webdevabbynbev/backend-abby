import type { HttpContext } from '@adonisjs/core/http'
import Banner from '#models/banner'
import Setting from '#models/setting'
import { SettingType } from '../../enums/setting_types.js'
import Faq from '#models/faq'

export default class HomeController {
    public async banner({ response }: HttpContext) {
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
        .select('key', 'value', 'createdAt', 'updatedAt') // ✅ pakai createdAt & updatedAt
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
}