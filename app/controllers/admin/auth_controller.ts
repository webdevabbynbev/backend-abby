import type { HttpContext } from '@adonisjs/core/http'

export default class AdminAuthController {
  /**
   * Get current admin user profile with role and permissions
   * GET /api/v1/admin/auth/me
   */
  public async me({ response, auth }: HttpContext) {
    try {
      const user = auth.user

      if (!user) {
        return response.status(401).send({
          message: 'Unauthorized',
          serve: null
        })
      }

      const userRole = user.role || 2 // Default to Guest if role is null

      return response.status(200).send({
        message: 'success',
        serve: {
          user: {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            photoProfile: user.photoProfile,
            role: userRole,
            role_name: user.role_name,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          },
          permissions: {
            can_manage_products: [1, 3, 5].includes(userRole),
            can_manage_stock: [1, 3, 6].includes(userRole),
            can_approve_transfers: [1, 3].includes(userRole),
            can_view_analytics: [1, 3, 4, 6].includes(userRole),
            can_manage_users: [1].includes(userRole),
            can_manage_finance: [1, 4].includes(userRole),
            can_access_pos: [1, 6, 7].includes(userRole),
            is_admin: userRole === 1,
            is_gudang: userRole === 3,
            is_finance: userRole === 4,
            is_media: userRole === 5,
            is_cashier_gudang: userRole === 6,
            is_cashier: userRole === 7
          },
          menu_access: {
            dashboard: [1, 3, 4, 6].includes(userRole),
            products: [1, 3, 5].includes(userRole),
            inventory: [1, 3, 6].includes(userRole),
            stock_transfers: [1, 3, 6].includes(userRole),
            analytics: [1, 3, 4].includes(userRole),
            users: [1].includes(userRole),
            finance: [1, 4].includes(userRole),
            pos: [1, 6, 7].includes(userRole)
          }
        }
      })
    } catch (error: any) {
      return response.status(500).send({
        message: error?.message || 'Internal Server Error',
        serve: null
      })
    }
  }

  /**
   * Get dashboard summary widgets
   * GET /api/v1/admin/auth/dashboard-summary
   */
  public async dashboardSummary({ response, auth }: HttpContext) {
    try {
      const user = auth.user
      if (!user) {
        return response.status(401).send({ message: 'Unauthorized', serve: null })
      }

      // This would integrate with existing dashboard services
      const summary = {
        user_role: user.role_name,
        personas: {
          abby_products: 0, // Will be populated by actual query
          bev_products: 0,  // Will be populated by actual query
          total_synced: 0   // Will be populated by actual query
        },
        channels: {
          total_channels: 6,
          channels: [
            'website',
            'offline_store', 
            'marketplace_tokopedia',
            'marketplace_shopee',
            'marketplace_blibli',
            'marketplace_tiktok'
          ]
        },
        quick_stats: {
          pending_transfers: 0,    // Will be populated by actual query
          low_stock_alerts: 0,     // Will be populated by actual query
          today_transactions: 0    // Will be populated by actual query
        }
      }

      return response.status(200).send({
        message: 'success',
        serve: summary
      })
    } catch (error: any) {
      return response.status(500).send({
        message: error?.message || 'Internal Server Error',
        serve: null
      })
    }
  }
}