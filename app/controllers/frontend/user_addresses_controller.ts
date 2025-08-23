import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import axios from 'axios'

const BASE_URL = env.get('KOMERCE_BASE_URL')
const API_KEY = env.get('KOMERCE_COST_API_KEY')

export default class UserAddressesController {
    public async getProvince({ response }: HttpContext) {
    try {
        const { data } = await axios.get(`${BASE_URL}/destination/province`, {
        headers: { key: API_KEY },
        })

        return response.status(200).send({
        message: 'Success',
        serve: data?.data ?? data, // fallback kalau field nya beda
        })
    } catch (e) {
        return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
        })
    }
    }

  public async getCity({ response, request }: HttpContext) {
    try {
        const provinceId = request.qs().province
        const { data } = await axios.get(
        `${BASE_URL}/destination/city/${provinceId}`,
        {
            headers: { key: API_KEY },
        }
        )

        return response.status(200).send({
        message: 'Success',
        serve: data?.data ?? data,
        })
    } catch (e) {
        return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
        })
    }
    }


    public async getSubDistrict({ response, request }: HttpContext) {
    try {
        const cityId = request.qs().city
        const { data } = await axios.get(
        `${BASE_URL}/destination/district/${cityId}`,
        {
            headers: { key: API_KEY },
        }
        )

        return response.status(200).send({
        message: 'Success',
        serve: data?.data ?? data,
        })
    } catch (e) {
        return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
        })
    }
    }

}