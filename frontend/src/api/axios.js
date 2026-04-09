import axios from 'axios'

const base = import.meta.env.VITE_API_BASE_URL || '/'

const api = axios.create({
  baseURL: base,
  timeout: 30000,
})

// Attach token on every request (fallback for SSR/refresh)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
