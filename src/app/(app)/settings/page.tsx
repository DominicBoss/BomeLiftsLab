'use client'

import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="card space-y-4">
      <div>
        <div className="h1">Settings</div>
        <p className="p-muted mt-2">Account & app preferences.</p>
      </div>

      <button className="btn" onClick={logout}>
        Logout
      </button>
    </div>
  )
}