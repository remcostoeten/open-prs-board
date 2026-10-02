import { z } from 'zod'

export const apiTokenSchema = z.object({
    email: z.email(),
    token: z.string().trim().min(20).max(1000),
})
