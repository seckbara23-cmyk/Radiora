const sections = [
  { title: 'Profile', description: 'Manage your personal information and credentials.' },
  { title: 'Notifications', description: 'Configure how and when you receive alerts.' },
  { title: 'Security', description: 'Password, two-factor authentication, and sessions.' },
  { title: 'Integrations', description: 'Connect to PACS, EHR, and other systems.' },
]

export default function SettingsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account and application preferences
        </p>
      </div>

      <div className="space-y-3">
        {sections.map((section) => (
          <div
            key={section.title}
            className="bg-white rounded-xl border border-gray-200 px-6 py-5 flex items-center justify-between"
          >
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{section.title}</h2>
              <p className="mt-0.5 text-sm text-gray-500">{section.description}</p>
            </div>
            <button className="text-sm font-medium text-blue-600 hover:text-blue-700 transition flex-shrink-0 ml-4">
              Configure
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
