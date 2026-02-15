export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <div className="shell">
        <div className="mb-8">
          <div className="text-sm text-white/60">BomeLifts Lab</div>
          <div className="h1 mt-1">Powerlifting Planner</div>
        </div>

        <div className="card">{children}</div>
      </div>
    </div>
  )
}