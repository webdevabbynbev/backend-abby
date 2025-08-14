import vine from '@vinejs/vine'

export const createTagProduct = vine.compile(
    vine.object({
        name: vine.string()
    })
)
    