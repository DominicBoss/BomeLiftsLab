import type { ReactNode } from 'react'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-sm text-white/60">BomeLifts Lab</div>
            <div className="h1 mt-1">Dashboard</div>
          </div>

          <div className="flex gap-2">
            <a className="btn" href="/dashboard">Home</a>
            <a className="btn" href="/plan">View Plan</a>
            <a className="btn" href="/history">History</a>
            <a className="btn" href="/settings">Settings</a>
          </div>
        </div>

        {children}
      </div>
    </div>
  )
}