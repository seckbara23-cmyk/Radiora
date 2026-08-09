// @ts-check
const withNextIntl = require('next-intl/plugin')('./src/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // R0.6 — dictation audio is uploaded THROUGH a server action
      // (uploadAudio / uploadFromMobile), so Next's 1 MB default body limit
      // rejected almost every real recording at the framework layer, before the
      // app's own validation could return its friendly error. The app already
      // promises 100 MB (MAX_AUDIO_BYTES in src/types/audio.ts) and the
      // dictation-audio bucket is configured for the same ceiling in migration
      // 018 — this aligns the third limit with those two.
      bodySizeLimit: '100mb',
    },
  },
}

module.exports = withNextIntl(nextConfig)
