/**
 * Live-test gating. Smoke tests that hit real APIs must never run silently in a
 * unit run and must never be faked when unreachable: they self-skip with a
 * printed reason unless the environment opts in. `pnpm test:live` sets
 * `ORCHESTR_LIVE=1`; a Composio-backed suite additionally needs
 * `COMPOSIO_API_KEY`.
 */

export const LIVE = process.env.ORCHESTR_LIVE === '1';

/** The shared Slack managed test account (docs/managed-oauth-eval.md fixture). */
export const DEFAULT_SLACK_ACCOUNT = process.env.SLACK_CONNECTED_ACCOUNT_ID ?? 'ca__Cj39ZC7cvDA';

export function composioApiKey(): string | undefined {
  const key = process.env.COMPOSIO_API_KEY;
  return key && key.length > 0 ? key : undefined;
}

/** `describe` that runs only under ORCHESTR_LIVE; otherwise skips with a visible reason. */
export function liveDescribe(name: string, fn: () => void): void {
  if (LIVE) {
    describe(name, fn);
  } else {
    describe.skip(`${name} [skipped: set ORCHESTR_LIVE=1 to run live]`, fn);
  }
}

/** `describe` that additionally requires COMPOSIO_API_KEY; skips with the missing reason named. */
export function liveComposioDescribe(name: string, fn: () => void): void {
  if (LIVE && composioApiKey()) {
    describe(name, fn);
  } else {
    const reason = !LIVE ? 'set ORCHESTR_LIVE=1' : 'COMPOSIO_API_KEY is unset';
    describe.skip(`${name} [skipped: ${reason}]`, fn);
  }
}
