// import type { HttpContext } from '@adonisjs/core/http'
import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'


export default class UsersController {
    async index({ response }: HttpContext) {
        const users = await User.all()
        return response.json(users)
    }
}