/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import AuthController from '#controllers/auth_controller'
import UsersController from '#controllers/users_controller'


router.post('/register', [AuthController, 'register'])
router.post('/login', [AuthController, 'login'])
router.get('/users', [UsersController, 'index'])
