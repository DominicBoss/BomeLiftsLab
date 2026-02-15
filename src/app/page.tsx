import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export default async function Home() {
  const supabase = await createClient()

  const { data } = await supabase.auth.getUser()
  const user = data.user

  if (user) {
    redirect('/dashboard')
  }

  redirect('/auth/login')
}