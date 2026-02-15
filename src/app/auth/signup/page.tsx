'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Signup() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async () => {
    if (!email || !password) {
      alert('Email and password required.')
      return
    }
    if (password.length < 8) {
      alert('Use at least 8 characters.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)

    if (error) {
      alert(error.message)
      return
    }

    router.push('/onboarding')
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="h1">Sign up</div>
        <p className="p-muted mt-2">Create your account and generate your first block.</p>
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
            placeholder="min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        <button onClick={handleSignup} disabled={loading} className="btn-full">
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </div>

      <p className="text-sm text-white/60">
        Already have an account? <a className="link" href="/auth/login">Login</a>
      </p>
    </div>
  )
}