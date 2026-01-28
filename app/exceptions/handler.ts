import app from '@adonisjs/core/services/app'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import { errors as limiterErrors } from '@adonisjs/limiter'

function vineErrorToMessage(error: any): string {
  const msgs =
    error?.messages ??
    error?.errors ??
    error?.body?.errors ??
    error?.body?.messages

  if (Array.isArray(msgs) && msgs.length) {
    return msgs[0]?.message || 'Validation error'
  }

  return error?.message || 'Validation error'
}

function vineErrorToServe(error: any) {
  return (
    error?.messages ??
    error?.errors ??
    error?.body?.errors ??
    error?.body?.messages ??
    null
  )
}

export default class HttpExceptionHandler extends ExceptionHandler {
  protected debug = !app.inProduction

  public async handle(error: unknown, ctx: HttpContext) {
    const { response } = ctx
    const err: any = error

    // 0) Rate limiting (429) - add default headers (Retry-After, etc.)
    if (err instanceof limiterErrors.E_TOO_MANY_REQUESTS) {
      const headers = err.getDefaultHeaders()
      for (const [key, value] of Object.entries(headers)) {
        response.header(key, value as any)
      }

      return response.status(err.status).send({
        message: 'Too many requests',
        serve: err.response ?? null,
      })
    }

    // 1) Vine validation errors
    if (err?.status === 422) {
      return response.status(422).send({
        message: vineErrorToMessage(err),
        serve: vineErrorToServe(err),
      })
    }

    // 2) Axios/HTTP client errors (err.httpStatus)
    if (typeof err?.httpStatus === 'number') {
      return response.status(err.httpStatus).send({
        message: err?.message || 'Error',
        serve: err?.response?.data ?? null,
      })
    }

    // 3) Generic HTTP errors (err.status)
    if (typeof err?.status === 'number') {
      return response.status(err.status).send({
        message: err?.message || 'Error',
        serve: null,
      })
    }

    // 4) Fallback - Don't expose internal error details in production
    const message = this.debug ? 
      (err?.message || 'Internal Server Error') : 
      'Internal Server Error'
      
    return response.status(500).send({
      message,
      serve: null,
    })
  }

  public async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
