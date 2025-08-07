/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const AuthController = () => import('#controllers/auth_controller')

router
  .group(() => {
    // Auth/OTP/Register routes
    router.post('/auth/login-google', [AuthController, 'loginGoogle'])
    router.post('/auth/register', [AuthController, 'register'])
    router.post('/auth/verify-register', [AuthController, 'verifyRegisterOtp'])
    router.post('/auth/login', [AuthController, 'login'])
    router.post('/auth/verify-login', [AuthController, 'verifyLoginOtp'])
    router.post('/auth/login-admin', [AuthController, 'loginAdmin'])

    // Admin CMS Routes
        router
        .group(() => {
            

        })
        .use(middleware.auth({ guards: ['api'] }))

        // User frontend Routes
        router
        .group(() => {
            router.post('/auth/logout', [AuthController, 'logout'])
            router.get('/profile', [AuthController, 'profile'])
            router.patch('/profile', [AuthController, 'updateProfile'])
            router.patch('/profile/picture', [AuthController, 'updateProfilePicture'])
        })
        .use(middleware.auth({ guards: ['api'] }))
  })
  .prefix('/api/v1')

