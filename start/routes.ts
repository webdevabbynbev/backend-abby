/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

router.get('/home', async () => {
  return {
    message: 'Welcome to the home page!',
  }
})

router.get('/user/:id?', async ({ params }) => {
  const userId = params.id
  return {
    message: `User ID is ${userId}`,
  }
})
