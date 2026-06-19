'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import {
  previewImport,
  commitImport,
  installStarterLibrary,
  type ImportState,
} from '@/lib/actions/template-import'

const INITIAL: ImportState = { error: null }

export function ImportClient({
  starterCount,
  starterAuthor,
}: {
  starterCount: number
  starterAuthor: string
}) {
  const t = useTranslations('templateImport')

  const [installState, installAction, installing] = useActionState(installStarterLibrary, INITIAL)
  const [previewState, previewAction, previewing] = useActionState(previewImport, INITIAL)
  const [commitState, commitAction, committing] = useActionState(commitImport, INITIAL)

  const preview = previewState.templates ?? []
  const committed = commitState.installed != null

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/templates" className="text-xs font-medium text-blue-600 hover:text-blue-700">
          {t('back')}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
      </div>

      {/* Starter library */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">{t('starterTitle')}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {t('starterDesc', { count: starterCount, author: starterAuthor })}
        </p>
        <form action={installAction} className="mt-4">
          {installState.error && <p className="mb-2 text-xs text-red-600">{installState.error}</p>}
          {installState.installed != null && (
            <p className="mb-2 text-xs text-green-600">
              {t('installResult', {
                installed: installState.installed,
                skipped: installState.skipped ?? 0,
              })}
            </p>
          )}
          <button
            type="submit"
            disabled={installing}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {installing ? '…' : t('installButton')}
          </button>
        </form>
      </section>

      {/* Import from document / paste */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">{t('importTitle')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('importDesc')}</p>

        <form action={previewAction} className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">{t('fileLabel')}</span>
            <input
              type="file"
              name="file"
              accept=".docx"
              className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
          </label>
          <div className="text-center text-xs text-gray-400">{t('or')}</div>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">{t('pasteLabel')}</span>
            <textarea
              name="text"
              rows={8}
              placeholder={t('pastePlaceholder')}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          {previewState.error && <p className="text-xs text-red-600">{previewState.error}</p>}
          <button
            type="submit"
            disabled={previewing}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-400 disabled:opacity-50"
          >
            {previewing ? '…' : t('previewButton')}
          </button>
        </form>
      </section>

      {/* Preview + confirm */}
      {preview.length > 0 && !committed && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-5">
          <h2 className="text-sm font-semibold text-gray-900">
            {t('previewTitle', { count: preview.length })}
          </h2>
          <ul className="mt-3 space-y-2">
            {preview.map((tpl, i) => (
              <li key={i} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  {tpl.modality && (
                    <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                      {tpl.modality}
                    </span>
                  )}
                  <span className="text-sm font-medium text-gray-900">{tpl.title}</span>
                </div>
                <div className="mt-1.5 grid gap-1 text-xs text-gray-500">
                  {tpl.indication && <SectionLine label={t('secIndication')} text={tpl.indication} />}
                  {tpl.technique && <SectionLine label={t('secTechnique')} text={tpl.technique} />}
                  <SectionLine label={t('secResults')} text={tpl.findings} />
                  {tpl.impression && <SectionLine label={t('secConclusion')} text={tpl.impression} />}
                </div>
              </li>
            ))}
          </ul>

          <form action={commitAction} className="mt-4">
            <input type="hidden" name="payload" value={JSON.stringify(preview)} />
            <input type="hidden" name="source" value="import:docx" />
            {commitState.error && <p className="mb-2 text-xs text-red-600">{commitState.error}</p>}
            <button
              type="submit"
              disabled={committing}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {committing ? '…' : t('confirmButton', { count: preview.length })}
            </button>
          </form>
        </section>
      )}

      {commitState.installed != null && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {t('installResult', {
            installed: commitState.installed,
            skipped: commitState.skipped ?? 0,
          })}{' '}
          <Link href="/templates" className="font-semibold underline">
            {t('viewTemplates')}
          </Link>
        </div>
      )}
    </div>
  )
}

function SectionLine({ label, text }: { label: string; text: string }) {
  const oneLine = text.replace(/\s*\n\s*/g, ' · ')
  return (
    <p className="truncate">
      <span className="font-semibold text-gray-600">{label}:</span>{' '}
      <span className="text-gray-500">{oneLine}</span>
    </p>
  )
}
