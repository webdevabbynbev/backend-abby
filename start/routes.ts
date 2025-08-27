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
const SettingCmsController = () => import('#controllers/cms/setting_cms_controller')
const SettingsController = () => import('#controllers/cms/settings_controller')
const AttributesController = () => import('#controllers/cms/attributes_controller')
const ProductController = () => import('#controllers/cms/products_controller')
const VouchersController = () => import('#controllers/cms/vouchers_controller')
const FaqsController = () => import('#controllers/cms/faqs_controller')
const BannerController = () => import('#controllers/cms/banners_controller')
const CmsHomeController = () => import('#controllers/cms/home_controller')
const CmsSupportTicketController = () => import('#controllers/cms/support_tickets_controller')
const CmsReviewsController = () => import('#controllers/cms/reviews_controller')
const CmsTagController = () => import('#controllers/cms/tags_controller')

const FeCategoryTypesController = () => import('#controllers/frontend/category_types_controller')
const FeVoucherController = () => import('#controllers/frontend/vouchers_controller')
const FeProductController = () => import('#controllers/frontend/products_controller')
const FeReviewController = () => import('#controllers/frontend/reviews_controller')
const FeWishlist = () => import('#controllers/frontend/wishlists_controller')
const FeSupportTicketController = () => import('#controllers/frontend/support_tickets_controller')
const UserAddressesController = () => import('#controllers/frontend/user_addresses_controller')
const FeHomeController = () =>import('#controllers/frontend/home_controller')


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
    router.post('/auth/send-otp', [AuthController, 'sendOtp'])

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
                router.get('/list', [CategoryTypesController, 'list'])  
                router.post('', [CategoryTypesController, 'store'])    
                router.put('/:slug', [CategoryTypesController, 'update']) 
                router.get('/:slug', [CategoryTypesController, 'show'])   
                router.delete('/:slug', [CategoryTypesController, 'delete']) 
              })
              .use(middleware.roleAdmin())
              .prefix('/category-types')

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
                router.get('/contact-us', [SettingsController, 'getContactUs'])
                router.post('/contact-us', [SettingsController, 'createContactUs'])
              })
              .use(middleware.roleAdmin())
            
            // Attribute Management
            router
              .group(() => {
                router.get('', [AttributesController, 'get'])
                router.get('/list', [AttributesController, 'list'])
                router.post('', [AttributesController, 'create'])
                router.put('', [AttributesController, 'update'])
                router.delete('', [AttributesController, 'delete'])
                router.post('/list-value/:attribute_id', [AttributesController, 'addValue'])
              })
              .use(middleware.roleAdmin())
              .prefix('/attribute')

            // Product Management
            router
              .group(() => {
                router.get('', [ProductController, 'get'])
                router.get('/flash-sale', [ProductController, 'getIsFlashsale'])
                router.get('/:id', [ProductController, 'show'])
                router.post('', [ProductController, 'create'])
                router.put('', [ProductController, 'update'])
                router.delete('', [ProductController, 'delete'])
                router.post('/update-order', [ProductController, 'updateProductIndex'])
              })
              .use(middleware.roleAdmin())
              .prefix('/product')

            // Voucher Management
            router
              .group(() => {
                router.get('', [VouchersController, 'get'])
                router.post('', [VouchersController, 'create'])
                router.put('', [VouchersController, 'update'])
                router.delete('', [VouchersController, 'delete'])
                router.put('/status', [VouchersController, 'updateStatus'])
              })
              .use(middleware.roleAdmin())
              .prefix('/voucher')

            // FAQ Management
            router
              .group(() => {
                router.get('', [FaqsController, 'index'])
                router.post('', [FaqsController, 'store'])
                router.put('/:id', [FaqsController, 'update'])
                router.get('/:id', [FaqsController, 'show'])
                router.delete('/:id', [FaqsController, 'delete'])
              })
              .use(middleware.roleAdmin())
              .prefix('/faq')
            
            // Banners Management
            router
              .group(() => {
                router.get('', [BannerController, 'index'])
                router.post('', [BannerController, 'store'])
                router.patch('/:id', [BannerController, 'update'])
                router.get('/:id', [BannerController, 'show'])
                router.delete('/:id', [BannerController, 'delete'])
                router.post('/update-order', [BannerController, 'updateProductIndex'])
              })
              .use(middleware.roleAdmin())
              .prefix('/banners')

            // Reviews Controller  
            router
              .group(() => {
                router.get('', [CmsReviewsController, 'index'])      
                router.get('/:id', [CmsReviewsController, 'show'])   
                router.delete('/:id', [CmsReviewsController, 'delete']) 
              })
              .use(middleware.roleAdmin())
              .prefix('/reviews')

            // Support Ticket Controller
            router
              .group(() => {
                router.get('', [CmsSupportTicketController, 'index'])   
                router.get('/:id', [CmsSupportTicketController, 'show']) 
                router.put('/:id', [CmsSupportTicketController, 'update']) 
              })
              .use(middleware.roleAdmin())
              .prefix('/support-tickets')

            // Tag Product Controller

            // Home CMS
            router.get('/total-user', [CmsHomeController, 'totalRegisterUser'])
            router.get('/total-register-user-period', [CmsHomeController,'totalRegisterUserByPeriod'])

          })
          .prefix('/admin')

        // User frontend Routes


        // Category Types (frontend)
        // List categories (tree structure)
        router.get('/category-types', [FeCategoryTypesController, 'list'])
        router.get('/category-types/:slug', [FeCategoryTypesController, 'show'])

        // Tag Products Management (frontend)

        // Home
        router.get('/products', [FeProductController, 'get'])
        router.get('/products/:path', [FeProductController, 'show'])
        
        // User Account Management
        router
        .group(() => {

            //Profile Management
            router.post('/auth/logout', [AuthController, 'logout'])
            router.get('/profile', [AuthController, 'profile'])
            router.patch('/profile', [AuthController, 'updateProfile'])
            router.patch('/profile/picture', [AuthController, 'updateProfilePicture'])
            router.patch('/profile/password', [AuthController, 'updatePassword'])
            router.post('/profile/deactivate', [AuthController, 'deactivateAccount'])

            // Voucher Validate
            router.post('/vouchers/validate', [FeVoucherController, 'validate'])

            // Wishlist
            router.get('/wishlists', [FeWishlist, 'get'])
            router.get('/wishlists/list', [FeWishlist, 'list'])
            router.post('/wishlists', [FeWishlist, 'create'])
            router.delete('/wishlists', [FeWishlist, 'delete'])

            // User Addresss 
            router.get('/addresses', [UserAddressesController, 'list'])
            router.post('/addresses', [UserAddressesController, 'create'])
            router.put('/addresses', [UserAddressesController, 'update'])
            router.delete('/addresses', [UserAddressesController, 'delete'])

            router.get('/province', [UserAddressesController, 'getProvince'])
            router.get('/city', [UserAddressesController, 'getCity'])
            router.get('/district', [UserAddressesController, 'getDistrict'])
            router.get('/sub-district', [UserAddressesController, 'getSubDistrict'])
            router.post('/get-cost', [UserAddressesController, 'getCost'])
        })
        .use(middleware.auth({ guards: ['api'] }))

        // Review Product
        router
        .group(() => {
          router.get('', [FeReviewController, 'index']) 
          router.post('', [FeReviewController, 'create']).use(middleware.auth({ guards: ['api'] }))
          router.post('/:id/toggle-like', [FeReviewController, 'toggleLike']).use(middleware.auth({ guards: ['api'] })) 
        })
        .prefix('/reviews')
        router.post('/support-tickets', [FeSupportTicketController, 'store'])

        // Home 
        router.get('/banners', [FeHomeController, 'banner'])
        router.get('/tnc', [FeHomeController, 'getTermAndCondition'])
        router.get('/return-policy', [FeHomeController, 'getReturnPolicy'])
        router.get('/privacy-policy', [FeHomeController, 'getPrivacyPolicy'])
        router.get('/contact-us', [FeHomeController, 'getContactSupport'])
        router.get('/faq', [FeHomeController, 'getFaq'])
        router.get('/about-us', [FeHomeController, 'getAboutUs'])
  })
  .prefix('/api/v1')

