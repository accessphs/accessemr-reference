// The folder this compiled module lives in. CommonJS provides __dirname; the ESM build's copy of this file is
// replaced after compilation (scripts/postbuild.mjs) with one based on import.meta.url.
declare const __dirname: string | undefined;
export const moduleDir: string = typeof __dirname === 'string' ? __dirname : '';
