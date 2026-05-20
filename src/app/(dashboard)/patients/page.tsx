import Link from 'next/link'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getPatients } from '@/lib/data/patients'
import { Badge, patientStatusVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

type Props = {
  searchParams: Promise<{ q?: string; status?: string }>
}

function age(dob: string): number {
  const diff = Date.now() - new Date(dob).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
}

export default async function PatientsPage({ searchParams }: Props) {
  const { q, status } = await searchParams
  await requireCurrentUser()

  const patients = await getPatients({
    search: q,
    status: status as 'active' | 'inactive' | 'deceased' | undefined,
  })

  const statuses = [
    { label: 'All',      value: ''         },
    { label: 'Active',   value: 'active'   },
    { label: 'Inactive', value: 'inactive' },
    { label: 'Deceased', value: 'deceased' },
  ]

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Patients</h1>
          <p className="mt-1 text-sm text-gray-500">
            {patients.length} patient{patients.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <Link
          href="/patients/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Patient
        </Link>
      </div>

      {/* Search + status filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form method="get" action="/patients" className="flex-1 flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            type="search"
            defaultValue={q ?? ''}
            placeholder="Search by name or MRN…"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Search
          </button>
        </form>
        <div className="flex gap-1">
          {statuses.map(({ label, value }) => {
            const p = new URLSearchParams()
            if (q)    p.set('q', q)
            if (value) p.set('status', value)
            const href = `/patients${p.toString() ? `?${p}` : ''}`
            const active = (status ?? '') === value
            return (
              <Link key={value} href={href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {patients.length === 0 ? (
          <EmptyState
            title="No patients found"
            description={q ? `No results for "${q}".` : 'Add your first patient to get started.'}
            action={
              <Link href="/patients/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
              >
                New Patient
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Patient</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">MRN</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">DOB / Age</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Sex</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden lg:table-cell">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {patients.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-3.5">
                      <Link href={`/patients/${p.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600 transition"
                      >
                        {p.lastName}, {p.firstName}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs text-gray-600">{p.mrn}</td>
                    <td className="px-6 py-3.5 text-gray-600 hidden sm:table-cell">
                      {p.dateOfBirth}{' '}
                      <span className="text-gray-400">({age(p.dateOfBirth)}y)</span>
                    </td>
                    <td className="px-6 py-3.5 text-gray-600 capitalize hidden md:table-cell">{p.sex}</td>
                    <td className="px-6 py-3.5 text-gray-600 hidden lg:table-cell">{p.phone ?? '—'}</td>
                    <td className="px-6 py-3.5">
                      <Badge variant={patientStatusVariant[p.status]}>{p.status}</Badge>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <Link href={`/patients/${p.id}`}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
