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
const UsersController = () => import('#controllers/cms/users_controller')

router
  .group(() => {
    // Auth/OTP/Register routes
    router.post('/auth/login-google', [AuthController, 'loginGoogle'])
    router.post('/auth/register', [AuthController, 'register'])
    router.post('/auth/verify-register', [AuthController, 'verifyRegisterOtp'])
    router.post('/auth/login', [AuthController, 'login'])
    router.post('/auth/verify-login', [AuthController, 'verifyLoginOtp'])
    router.post('/auth/login-admin', [AuthController, 'loginAdmin'])

    router.post('/auth/forgot', [AuthController, 'requestForgotPassword'])
    router.get('/auth/forgot-password/:email/verify',[AuthController, 'verifyForgotPassword']).as('verifyForgotPassword')
    router.post('/auth/reset-password', [AuthController, 'resetPassword'])

        // Admin CMS Routes
        router
          .group(() => {
            // User Management
            router
              .group(() => {
                router.get('', [UsersController, 'index'])
                router.get('list', [UsersController, 'list'])
                router.post('', [UsersController, 'store'])
                router.put('/:id', [UsersController, 'update'])
                router.get('/:id', [UsersController, 'show'])
                router.delete('/:id', [UsersController, 'delete'])
              })
              .use(middleware.roleAdmin())
              .prefix('/users')

            router.get('/customers', [UsersController, 'customers'])
          })
          .prefix('/admin')

        // User frontend Routes
        router
        .group(() => {
            router.post('/auth/logout', [AuthController, 'logout'])
            router.get('/profile', [AuthController, 'profile'])
            router.patch('/profile', [AuthController, 'updateProfile'])
            router.patch('/profile/picture', [AuthController, 'updateProfilePicture'])
            router.patch('/profile/password', [AuthController, 'updatePassword'])
            router.post('/profile/deactivate', [AuthController, 'deactivateAccount'])
        })
        .use(middleware.auth({ guards: ['api'] }))
  })
  .prefix('/api/v1')

