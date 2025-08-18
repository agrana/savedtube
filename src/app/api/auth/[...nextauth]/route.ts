import handlers from 'next-auth/next'
import { authOptions } from '@/lib/auth'

const { GET, POST } = handlers(authOptions)

export { GET, POST }
