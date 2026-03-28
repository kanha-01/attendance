import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(null)
  const [ready, setReady] = useState(false)

  // Restore session from localStorage
  useEffect(() => {
    const token = localStorage.getItem('token')
    const saved  = localStorage.getItem('user')
    if (token && saved) {
      try {
        setUser(JSON.parse(saved))
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      } catch {
        localStorage.clear()
      }
    }
    setReady(true)
  }, [])

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/api/auth/login', { username: username.trim(), password })
    localStorage.setItem('token', data.access_token)
    api.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`

    const me = await api.get('/api/auth/me')
    const fullUser = { ...data, ...me.data }
    localStorage.setItem('user', JSON.stringify(fullUser))
    setUser(fullUser)
    return fullUser
  }, [])

  // Call after any profile update to sync localStorage + state
  const refreshUser = useCallback(async () => {
    try {
      const me = await api.get('/api/auth/me')
      const token = localStorage.getItem('token')
      const existing = JSON.parse(localStorage.getItem('user') || '{}')
      const updated = { ...existing, ...me.data }
      localStorage.setItem('user', JSON.stringify(updated))
      setUser(updated)
      return updated
    } catch {
      // token expired or revoked — log out
      logout()
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, ready }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
