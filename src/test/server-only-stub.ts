// Test-only stand-in for the `server-only` package (see vitest.config.ts).
//
// In a Next build, importing 'server-only' makes the bundler fail if the module
// ever reaches a client bundle. That guard has no runtime body to resolve under
// vitest, so this empty module takes its place during tests. The real import
// stays in the source files, which is where it does its job.
export {}
