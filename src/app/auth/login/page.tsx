'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) {
      alert('Email and password required.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) {
      alert(error.message)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="h1">Login</div>
        <p className="p-muted mt-2">Continue your plan and log your training.</p>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-sm text-white/70 mb-1">Email</div>
          <input
            className="input"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        <div>
          <div className="text-sm text-white/70 mb-1">Password</div>
          <input
            type="password"
            className="input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <button onClick={handleLogin} disabled={loading} className="btn-full">
          {loading ? 'Logging in…' : 'Login'}
        </button>
      </div>

      <p className="text-sm text-white/60">
        No account? <a className="link" href="/auth/signup">Sign up</a>
      </p>
    </div>
  )
}