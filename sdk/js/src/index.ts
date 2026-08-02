/**
 * Shojiku for Node.js — a template plus your data, deterministically, as a PDF.
 *
 * ```js
 * import { Client } from 'shojiku';
 *
 * const client = new Client({ templates: 'app/templates' });
 * const result = await client.generate('receipt_ja', { customer: { name: 'Yamada Shoji K.K.' } });
 * if (result.success) await result.artifact.write('receipt.pdf');
 * ```
 *
 * Four things about this package are worth knowing before reading any of it.
 *
 * **Results, not exceptions.** No lifecycle operation rejects in the normal
 * flow. What throws is programmer misuse (`UsageError`) and an environment with
 * no engine in it (`LibraryNotFoundError`).
 *
 * **Everything is async.** Rendering is CPU work; the addon runs it on the
 * libuv threadpool so the event loop stays free. There are deliberately no
 * synchronous twins — a blocking render is the one thing node cannot afford.
 *
 * **Nothing here reimplements the engine.** Layout, formatting and PDF
 * construction all happen inside the native addon, so the same params produce
 * the same bytes here, in the CLI, in the Designer and in the other six SDKs. A
 * missing capability is missing in the engine and gets added there.
 *
 * **Nothing here downloads anything**, at install time or at run time. The
 * platform package carries the addon; otherwise you point `SHOJIKU_LIBRARY` at
 * one you built. Sources an application fetched itself go to `generateSource` —
 * fetching is the application's act, and a deployment that wants to forbid even
 * that declares `strict` (see `Lockdown`).
 */

export type { ArtifactInit } from './artifact.js';
export { DocumentArtifact, Origin } from './artifact.js';
export type { Anchors } from './client.js';
export { Client } from './client.js';
export type { ClientOptions } from './config.js';
export { Config, config, configure, resetConfiguration } from './config.js';
export { Diagnostic } from './diagnostic.js';
export {
  AbiMismatchError,
  LibraryNotFoundError,
  MaterialUnreadableError,
  ShojikuError,
  UnwrapError,
  UsageError,
} from './errors.js';
export type { FailureInit } from './failure.js';
export { Failure, Step } from './failure.js';
export type { LocalPemInit } from './localPem.js';
export { LocalPem } from './localPem.js';
export { Lockdown } from './lockdown.js';
export type { Logger } from './log.js';
export { Result } from './result.js';
export type { Sources } from './sources.js';
export { Check, VerificationReport } from './verificationReport.js';
export { VERSION } from './version.js';
