
// src/app/onboarding/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { generatePlanInDb } from '@/lib/generatePlan'
import { supabase } from '@/lib/supabase'

export default function OnboardingPage() {

  const router = useRouter()

  const [daysOfWeek, setDaysOfWeek] = useState<string[]>(['Mon','Wed','Fri'])
  const [proficiency, setProficiency] = useState<'Beginner'|'Advanced'>('Beginner')
  const [weaknesses, setWeaknesses] = useState<string[]>([])

  const [squat, setSquat] = useState('')
  const [bench, setBench] = useState('')
  const [deadlift, setDeadlift] = useState('')

  const [deloadAfterWeek8, setDeloadAfterWeek8] = useState(true)
  const [deloadAfterWeek10, setDeloadAfterWeek10] = useState(false)

  const toggleDay = (day:string) => {
    if (daysOfWeek.includes(day)) {
      setDaysOfWeek(daysOfWeek.filter(d => d !== day))
    } else {
      setDaysOfWeek([...daysOfWeek, day])
    }
  }

  const toggleWeakness = (w:string) => {
    if (weaknesses.includes(w)) {
      setWeaknesses(weaknesses.filter(x => x !== w))
    } else {
      setWeaknesses([...weaknesses, w])
    }
  }

  const handleSubmit = async () => {

    if (daysOfWeek.length < 3 || daysOfWeek.length > 6) {
      alert('Select between 3 and 6 training days.')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      alert('Not authenticated')
      return
    }

    await generatePlanInDb({
      userId: user.id,
      daysOfWeek: daysOfWeek as any,
      oneRMs: {
        squat: Number(squat),
        bench: Number(bench),
        deadlift: Number(deadlift)
      },
      proficiency,
      weaknesses,
      deloadAfterWeek8,
      deloadAfterWeek10
    })

    router.push('/dashboard')
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">

      <h1 className="text-2xl font-bold">Plan Setup</h1>

      <div>
        <h2 className="font-semibold">Training Days (3–6)</h2>
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => (
          <label key={day} className="block">
            <input
              type="checkbox"
              checked={daysOfWeek.includes(day)}
              onChange={() => toggleDay(day)}
            /> {day}
          </label>
        ))}
      </div>

      <div>
        <h2 className="font-semibold">Proficiency</h2>
        <select
          value={proficiency}
          onChange={(e)=>setProficiency(e.target.value as any)}
          className="border p-2"
        >
          <option value="Beginner">Beginner</option>
          <option value="Advanced">Advanced</option>
        </select>
      </div>

      <div>
        <h2 className="font-semibold">Weakness Focus (optional)</h2>
        <label className="block">
          <input type="checkbox"
            checked={weaknesses.includes('bench_off_chest')}
            onChange={()=>toggleWeakness('bench_off_chest')}
          /> Bench – Off Chest
        </label>
        <label className="block">
          <input type="checkbox"
            checked={weaknesses.includes('bench_lockout')}
            onChange={()=>toggleWeakness('bench_lockout')}
          /> Bench – Lockout
        </label>
        <label className="block">
          <input type="checkbox"
            checked={weaknesses.includes('squat_hole')}
            onChange={()=>toggleWeakness('squat_hole')}
          /> Squat – Out of Hole
        </label>
        <label className="block">
          <input type="checkbox"
            checked={weaknesses.includes('deadlift_off_floor')}
            onChange={()=>toggleWeakness('deadlift_off_floor')}
          /> Deadlift – Off Floor
        </label>
      </div>

      <div>
        <h2 className="font-semibold">Current 1RMs</h2>
        <input
          type="number"
          placeholder="Squat 1RM"
          value={squat}
          onChange={(e)=>setSquat(e.target.value)}
          className="border p-2 block mb-2"
        />
        <input
          type="number"
          placeholder="Bench 1RM"
          value={bench}
          onChange={(e)=>setBench(e.target.value)}
          className="border p-2 block mb-2"
        />
        <input
          type="number"
          placeholder="Deadlift 1RM"
          value={deadlift}
          onChange={(e)=>setDeadlift(e.target.value)}
          className="border p-2 block"
        />
      </div>

      <div>
        <h2 className="font-semibold">Deload Options</h2>
        <label className="block">
          <input
            type="checkbox"
            checked={deloadAfterWeek8}
            onChange={()=>setDeloadAfterWeek8(!deloadAfterWeek8)}
          /> Insert Deload After Week 8
        </label>
        <label className="block">
          <input
            type="checkbox"
            checked={deloadAfterWeek10}
            onChange={()=>setDeloadAfterWeek10(!deloadAfterWeek10)}
          /> Insert Deload After Week 10
        </label>
      </div>

      <button
        onClick={handleSubmit}
        className="bg-black text-white px-4 py-2"
      >
        Generate Plan
      </button>

    </div>
  )
}
