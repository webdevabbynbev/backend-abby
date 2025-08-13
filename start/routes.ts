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
const CategoryTypesController = () => import('#controllers/cms/category_types_controller')
const TagsController = () => import('#controllers/cms/tags_controller')
const SubTagsController = () => import('#controllers/cms/sub_tags_controller')
const DetailSubTagsController = () => import('#controllers/cms/detail_sub_tags_controller')
const SettingCmsController = () => import('#controllers/cms/setting_cms_controller')
const SettingsController = () => import('#controllers/cms/settings_controller')

const FeCategoryTypesController = () => import('#controllers/frontend/category_types_controller')
const FeTagsController = () => import('#controllers/frontend/tags_controller')
const FeSubTagsController = () => import('#controllers/frontend/sub_tags_controller')
const FeDetailSubTagsController = () => import('#controllers/frontend/detail_sub_tags_controller')


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

            // Category Types Management
            router
              .group(() => {
                router.get('', [CategoryTypesController, 'index'])     
                router.get('list', [CategoryTypesController, 'list'])  
                router.post('', [CategoryTypesController, 'store'])    
                router.put('/:slug', [CategoryTypesController, 'update']) 
                router.get('/:slug', [CategoryTypesController, 'show'])   
                router.delete('/:slug', [CategoryTypesController, 'delete']) 
              })
              .use(middleware.roleAdmin())
              .prefix('/category-types')

            // Tags Management
            router
              .group(() => {
                router.get('', [TagsController, 'get'])        
                router.get('list', [TagsController, 'list'])   
                router.post('', [TagsController, 'create'])    
                router.put('/:id', [TagsController, 'update']) 
                router.delete('/:id', [TagsController, 'delete']) 
              })
              .use(middleware.roleAdmin())
              .prefix('/tags')

            // Sub Tag Management
            router
              .group(() => {
                router.get('', [SubTagsController, 'get'])
                router.post('', [SubTagsController, 'create'])
                router.put('/:id', [SubTagsController, 'update']) 
                router.delete('/:id', [SubTagsController, 'delete']) 
              })
              .use(middleware.roleAdmin())
              .prefix('/sub-tags')

            // Detail Tag Management
            router
              .group(() => {
                router.get('', [DetailSubTagsController, 'get'])
                router.post('', [DetailSubTagsController, 'create'])    
                router.put('/:id', [DetailSubTagsController, 'update']) 
                router.delete('/:id', [DetailSubTagsController, 'delete']) 
              })
              .use(middleware.roleAdmin())
              .prefix('/detail-sub-tags')

            // Settings CMS Management
            router
              .group(() => {
                router.get('', [SettingCmsController, 'get'])
                router.post('', [SettingCmsController, 'create'])
                router.put('/:id', [SettingCmsController, 'update'])
                router.delete('/:id', [SettingCmsController, 'delete'])
              })
              .use(middleware.roleAdmin())
              .prefix('/settings')

            // Settings Management
            router
              .group(() => {
                router.get('/term-and-conditions', [SettingsController, 'getTermAndCondition'])
                router.post('/term-and-conditions', [SettingsController, 'createTermAndCondition'])
                router.get('/privacy-policy', [SettingsController, 'getPrivacyPolicy'])
                router.post('/privacy-policy', [SettingsController, 'createPrivacyPolicy'])
                router.get('/return-policy', [SettingsController, 'getReturnPolicy'])
                router.post('/return-policy', [SettingsController, 'createReturnPolicy'])
                router.get('/about-us', [SettingsController, 'getAboutUs'])
                router.post('/about-us', [SettingsController, 'createAboutUs'])
              })
              .use(middleware.roleAdmin())

          })
          .prefix('/admin')

        // User frontend Routes
        // Tag, SubTag, DetailSubTag Management (frontend)
        router.get('/tags', [FeTagsController, 'list'])
        router.post('/tags/list', [FeTagsController, 'listByPath'])
        router.post('/sub-tags/list', [FeSubTagsController, 'listByPath'])
        router.post('/detail-sub-tags/list', [FeDetailSubTagsController, 'listByPath'])

        // Tag Management (frontend)
        router.get('/category-types', [FeCategoryTypesController, 'list'])

        // User Account Management
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

