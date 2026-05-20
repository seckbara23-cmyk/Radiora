import { mockClinic } from '@/lib/mock-data'
import { Badge, clinicStatusVariant } from '@/components/ui/badge'
import type { ClinicPlan } from '@/types/clinic'

const planLabel: Record<ClinicPlan, string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
}

const clinics = [mockClinic]

export default function AdminClinicsPage() {
  return (
    <div className="min-h-full bg-gray-50 py-8 px-4 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Admin</p>
            <h1 className="text-xl font-semibold text-gray-900">Clinics</h1>
            <p className="mt-1 text-sm text-gray-500">
              {clinics.length} clinic{clinics.length !== 1 ? 's' : ''} registered
            </p>
          </div>
          <button className="self-start sm:self-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition">
            Add Clinic
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Clinic</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Users</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {clinics.map((clinic) => (
                  <tr key={clinic.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-gray-900">{clinic.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{clinic.slug}</p>
                    </td>
                    <td className="px-6 py-3.5 text-gray-500 hidden md:table-cell">
                      {clinic.city}, {clinic.state}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                        {planLabel[clinic.plan]}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-gray-500 hidden lg:table-cell">
                      {clinic.userCount}
                    </td>
                    <td className="px-6 py-3.5">
                      <Badge variant={clinicStatusVariant[clinic.status]}>
                        {clinic.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button className="text-xs font-medium text-blue-600 hover:text-blue-700">
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
