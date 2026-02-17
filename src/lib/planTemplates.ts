export type PlanKey = 'PerformanceBased'

export type DayName = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

export const allDayNames: DayName[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// NOTE:
// The previous per-week "template" system was removed.
// Plan generation is now table-driven in src/lib/staticPlanTables.ts and assembled in src/lib/generatePlan.ts.