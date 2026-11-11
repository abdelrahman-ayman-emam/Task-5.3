import axios from 'axios'

// `withCredentials: true` makes the browser send (and store) the auth cookie on
// cross-origin requests to the API. The JWT is no longer kept in localStorage,
// so there is no token to attach by hand anymore.
export const api = axios.create({
  baseURL: 'http://localhost:4000/api',
  withCredentials: true
})

let csrfToken
let csrfTokenRequest

async function getCsrfToken() {
  if (csrfToken) return csrfToken
  if (!csrfTokenRequest) {
    csrfTokenRequest = api.get('/csrf-token')
      .then(({ data }) => {
        csrfToken = data.csrfToken
        return csrfToken
      })
      .finally(() => {
        csrfTokenRequest = undefined
      })
  }
  return csrfTokenRequest
}

api.interceptors.request.use(async (config) => {
  const method = (config.method || 'get').toLowerCase()
  if (['get', 'head', 'options'].includes(method)) return config

  // Login and registration establish the cookie session and are intentionally
  // exempt; every other write must prove it came from this application.
  const path = (config.url || '').replace(/^\/+/, '')
  if (path === 'auth/login' || path === 'auth/register') return config

  const token = await getCsrfToken()
  config.headers = config.headers || {}
  if (typeof config.headers.set === 'function') {
    config.headers.set('x-csrf-token', token)
  } else {
    config.headers['x-csrf-token'] = token
  }
  return config
})

api.interceptors.response.use((response) => {
  const path = (response.config?.url || '').replace(/^\/+/, '')
  if (['auth/login', 'auth/register', 'auth/logout'].includes(path)) {
    // A new login/registration changes the JWT session identifier used to
    // bind the CSRF token. Fetch a fresh token on the next write.
    csrfToken = undefined
    csrfTokenRequest = undefined
  }
  return response
})
