// R2.8 landing rebuild — the hero's product mockup.
//
// This is the page's main explanatory device: a visitor should understand
// "dictate on the phone → structured report on the workstation" from the
// picture alone, before reading a word. It replaces the faint abstract
// RadiologyScanMark, which explained nothing.
//
// BUILT IN CSS, NOT AN IMAGE. No screenshot, no PNG, no next/image remote
// config, no external host, no new dependency — so it stays crisp at every
// density, weighs nothing, and localises with the rest of the page.
//
// THE CONTENT IS FICTIONAL AND ALREADY VETTED. The report text mirrors the
// `cerebral` entry in src/lib/demo/demo-samples.ts, which is documented there
// as fictional illustrative data containing NO real patient information. The
// patient name is that same fictional demo identity. Nothing here is a real
// study, and nothing implies Radiora produced a diagnosis on its own.
//
// Pure and presentational: every string arrives as a prop from the server
// component that read the translations, so this file holds no copy of its own
// and needs no client runtime.

export interface MockupLabels {
  alt: string
  newReport: string
  reports: string
  templates: string
  patientLabel: string
  examLabel: string
  dateLabel: string
  patientValue: string
  examValue: string
  dateValue: string
  saveDraft: string
  reviewSign: string
  phoneTitle: string
  phoneSubtitle: string
  phoneTimer: string
  phoneRecording: string
  phoneSend: string
}

export interface MockupReport {
  indication: string
  technique: string
  results: string
  conclusion: string
}

export interface SectionLabels {
  indication: string
  technique: string
  results: string
  conclusion: string
}

/** Fixed-height bars suggesting a voice waveform. Deterministic — no random. */
const WAVE = [5, 9, 14, 20, 26, 20, 13, 22, 30, 24, 16, 10, 18, 25, 19, 12, 7, 14, 21, 15, 9, 6, 11, 17]

function Waveform({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 32" className={className} aria-hidden="true" focusable="false" preserveAspectRatio="none">
      {WAVE.map((h, i) => (
        <rect
          key={i}
          x={i * 5 + 1}
          y={(32 - h) / 2}
          width="2.4"
          height={h}
          rx="1.2"
          fill="currentColor"
          opacity={0.35 + (h / 30) * 0.65}
        />
      ))}
    </svg>
  )
}

function ReportSection({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border border-gray-100 bg-white px-3 py-2">
      <p className="text-[7px] font-bold uppercase tracking-[0.09em] text-blue-600">{label}</p>
      <p className="mt-0.5 text-[8px] leading-snug text-gray-600">{text}</p>
    </div>
  )
}

export function ProductMockup({
  labels, report, sectionLabels, className = '',
}: {
  labels: MockupLabels
  report: MockupReport
  sectionLabels: SectionLabels
  className?: string
}) {
  return (
    // One accessible description for the whole composition. The internals are
    // decorative detail — announcing every mock label would be noise.
    <div role="img" aria-label={labels.alt} className={`relative select-none ${className}`}>

      {/* ── Workstation ── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl shadow-slate-900/10">
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
          <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
          <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
        </div>

        <div className="flex">
          {/* Sidebar — the real R2.1 navigation: three clinical items, nothing else */}
          <aside className="hidden w-[124px] shrink-0 border-r border-gray-100 bg-gray-50/70 p-3 sm:block">
            <div className="flex items-center gap-1">
              <span className="flex h-4 w-4 items-center justify-center rounded bg-blue-600 text-[7px] font-extrabold text-white">R</span>
              <span className="text-[8px] font-bold tracking-tight text-gray-900">RADIORA</span>
            </div>
            <div className="mt-3 rounded bg-blue-600 px-2 py-1.5 text-[7px] font-semibold text-white">
              + {labels.newReport}
            </div>
            <div className="mt-1 rounded px-2 py-1.5 text-[7px] font-medium text-gray-500">{labels.reports}</div>
            <div className="rounded px-2 py-1.5 text-[7px] font-medium text-gray-500">{labels.templates}</div>
          </aside>

          {/* Document */}
          <div className="min-w-0 flex-1 p-3.5">
            {/* Patient / exam strip */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2">
              {[
                [labels.patientLabel, labels.patientValue],
                [labels.examLabel, labels.examValue],
                [labels.dateLabel, labels.dateValue],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-[6.5px] uppercase tracking-wide text-gray-400">{k}</p>
                  <p className="text-[8px] font-semibold text-gray-800">{v}</p>
                </div>
              ))}
            </div>

            <div className="mt-2.5 space-y-2">
              <ReportSection label={sectionLabels.indication} text={report.indication} />
              <ReportSection label={sectionLabels.technique}  text={report.technique} />
              <ReportSection label={sectionLabels.results}    text={report.results} />
              <ReportSection label={sectionLabels.conclusion} text={report.conclusion} />
            </div>

            {/* One dominant next action, exactly as the workstation behaves */}
            <div className="mt-3 flex items-center justify-end gap-2">
              <span className="rounded border border-gray-200 px-2.5 py-1.5 text-[7px] font-semibold text-gray-500">
                {labels.saveDraft}
              </span>
              <span className="rounded bg-blue-600 px-2.5 py-1.5 text-[7px] font-semibold text-white">
                {labels.reviewSign}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Phone, overlapping ──
          Mobile dictation is a core input, not an accessory, so it sits in
          front of the workstation rather than beside it. Hidden below `sm:`
          where the overlap would cover the report it is meant to explain. */}
      <div className="absolute -bottom-7 -left-7 hidden w-[132px] overflow-hidden rounded-[14px] border-[3px] border-slate-800 bg-white shadow-xl shadow-slate-900/20 sm:block">
        <div className="bg-slate-800 px-2.5 pb-1.5 pt-2">
          <p className="text-[7px] font-semibold text-white">{labels.phoneTitle}</p>
          <p className="text-[6.5px] text-slate-300">{labels.phoneSubtitle}</p>
        </div>
        <div className="px-2.5 py-3">
          <Waveform className="h-7 w-full text-blue-500" />
          <p className="mt-2 text-center text-[11px] font-bold tabular-nums tracking-tight text-gray-900">
            {labels.phoneTimer}
          </p>
          <p className="mt-1 flex items-center justify-center gap-1 text-[6.5px] font-medium text-red-600">
            <span className="h-1 w-1 rounded-full bg-red-600" />
            {labels.phoneRecording}
          </p>
          <div className="mt-2.5 rounded bg-blue-600 px-2 py-1.5 text-center text-[7px] font-semibold text-white">
            {labels.phoneSend}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The waveform, reused by the "Radiora en action" dictation card. */
export { Waveform }
