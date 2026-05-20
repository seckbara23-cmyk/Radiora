import { Link } from '@/i18n/navigation'
import { redirect } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth/get-current-user'
import { getTemplates } from '@/lib/data/templates'
import { ToggleTemplateButton } from './ToggleTemplateButton'

export const metadata = { title: 'Report Templates' }

const TEMPLATE_ROLES = ['super_admin', 'clinic_admin', 'radiologist'] as const

export default async function TemplatesPage() {
  const user = await requireCurrentUser()

  if (!TEMPLATE_ROLES.includes(user.role as typeof TEMPLATE_ROLES[number])) {
    redirect('/dashboard')
  }

  const templates = await getTemplates()
  const active   = templates.filter((t) => t.isActive)
  const inactive = templates.filter((t) => !t.isActive)

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Report Templates</h1>
          <p className="mt-1 text-sm text-gray-500">
            {active.length} active template{active.length !== 1 ? 's' : ''}
            {inactive.length > 0 && ` · ${inactive.length} inactive`}
          </p>
        </div>
        <Link
          href="/templates/new"
          className="flex-shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition"
        >
          + New Template
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
          <p className="text-sm font-medium text-gray-700">No templates yet</p>
          <p className="mt-1 text-sm text-gray-400">
            Create templates to speed up report writing and ensure clinical consistency.
          </p>
          <Link
            href="/templates/new"
            className="mt-4 inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition"
          >
            Create your first template
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Modality</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Body Part</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map((t) => (
                <tr key={t.id} className={t.isActive ? '' : 'opacity-60'}>
                  <td className="px-5 py-3.5 font-medium text-gray-900">
                    {t.title}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 hidden sm:table-cell">
                    {t.modality ? (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {t.modality}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">Any</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 hidden md:table-cell">
                    {t.bodyPart ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      t.isActive
                        ? 'bg-green-50 text-green-700 ring-green-600/20'
                        : 'bg-gray-50 text-gray-600 ring-gray-500/20'
                    }`}>
                      {t.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-4">
                      <Link
                        href={`/templates/${t.id}/edit`}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 transition"
                      >
                        Edit
                      </Link>
                      <ToggleTemplateButton id={t.id} isActive={t.isActive} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
