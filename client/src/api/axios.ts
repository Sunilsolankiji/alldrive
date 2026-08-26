import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Only redirect on 401 for protected API calls, not for login/sync attempts
    const url: string = err.config?.url ?? ''
    const isAuthAttempt = url.includes('/auth/login') || url.includes('/auth/sync')
    if (err.response?.status === 401 && !isAuthAttempt) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
