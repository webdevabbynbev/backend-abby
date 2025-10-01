# adonis-captcha-guard
This is a AdonisJS V6 package that protect your applications from bots and spam attacks. Cloudflare Turnstile and Google reCAPTCHA v3 are supported as of now.

## Pre Condition
- Cloudflare Turnstile
  #### Step 1: Register a Cloudflare account
  #### Step 2: Get a site key and secret, follow this [documentation](https://developers.cloudflare.com/turnstile/get-started/)

- Google reCAPTCHA
  #### Step 1: Register a Google developer account
  #### Step 2: Get a site key and secret, follow this [documentation](https://www.google.com/recaptcha/admin/create)
  >  [!CAUTION]
  > Don't follow this [documentation](https://console.cloud.google.com/security/recaptcha) to create site key and secret, it will return an error when validate token. This is bad on Google's end that they have multiple sources for the same targeted facility, and one of those ways is sort of deprecated or not-working.

## Installation
```bash
npm i adonis-captcha-guard
node ace configure adonis-captcha-guard
```

## Set Env Variables
```txt
TURNSTILE_SITE_KEY=YOUR_TURNSTILE_SITE_KEY
TURNSTILE_SECRET=YOUR_TURNSTILE_SECRET

RECAPTCHA_SITE_KEY=YOUR_RECAPTCHA_SITE_KEY
RECAPTCHA_SECRET=YOUR_RECAPTCHA_SECRET
```

## Usage
- Cloudflare Turnstile token validate
```ts
import type { HttpContext } from '@adonisjs/core/http'

...
    async check(ctx: HttpContext) {
        const turnstileService = ctx.captcha.use('turnstile')
        const validateResult = await (turnstileService as any).validate()
        if (!validateResult.success) {
            // handle bot or spam attack request and return
        }
        // handle normal request
    }
...
```
- Google reCAPTCHA token validate
  
```ts
import type { HttpContext } from '@adonisjs/core/http'

...
    async check(ctx: HttpContext) {
        const recaptchaService = ctx.captcha.use('recaptcha')
        const validateResult = await (recaptchaService as any).validate()
        if (!validateResult.success) {
            // handle bot or spam attack request and return
        }
        // handle normal request
    }
...
```

## Contributors
This project is contributed by u301 team for giving back to the AdonisJS community. [Create an issue](https://github.com/monojson/adonis-captcha-guard/issues/new) to give suggestions or feedback questions.


## Who's Using
- [u301](https://u301.link/fuWf)