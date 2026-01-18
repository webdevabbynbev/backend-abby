import app from '@adonisjs/core/services/app'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'

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

    if (err?.status === 422) {
      return response.status(422).send({
        message: vineErrorToMessage(err),
        serve: vineErrorToServe(err),
      })
    }

    if (typeof err?.httpStatus === 'number') {
      return response.status(err.httpStatus).send({
        message: err?.message || 'Error',
        serve: err?.response?.data ?? null,
      })
    }

    if (typeof err?.status === 'number') {
      return response.status(err.status).send({
        message: err?.message || 'Error',
        serve: null,
      })
    }

    // 4) Fallback
    return response.status(500).send({
      message: err?.message || 'Internal Server Error',
      serve: null,
    })
  }

  public async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
