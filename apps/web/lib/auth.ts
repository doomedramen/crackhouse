import { createAuthClient } from 'better-auth/react'
import { authConfig } from './config'

export const authClient = createAuthClient({
  baseURL: authConfig.baseURL,
  // Enable all the features you need
  features: {
    // Enable social providers if needed
  },
})