import vine from '@vinejs/vine'

export const createCategoryType = vine.compile(
    vine.object({
        name: vine.string()
    })
)
    