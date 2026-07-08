import type { ApiKeyScheme, AuthHandle } from '../../core/auth';
import type { HttpClient } from '../../core/http/client';
import type { DropdownOption } from '../../core/props';

/**
 * Shared Stripe building blocks. Clean-room: Stripe's `/v1` REST endpoints, the
 * Bearer secret-key auth, and the `{ object: 'list', data, has_more }` envelope
 * are Stripe's public API contract, read as *spec* and re-expressed here.
 *
 * Note (framework gap, see docs/verification-queue.md): Stripe **write** calls
 * require `application/x-www-form-urlencoded` bodies with bracketed nested params
 * (`address[line1]=…`). The SDK's client/transport emit JSON only, so this module
 * ships Stripe's **read** verbs (GET + query params — unaffected) and defers
 * create/update/refund until the client can encode form bodies.
 */

export const STRIPE_API_BASE = 'https://api.stripe.com/v1';

/**
 * Stripe authenticates with a secret key as a Bearer token; managed Connect OAuth
 * mints a token used the same way. Declared as an `apiKey` header scheme so both
 * rails run byte-identical action code.
 */
export const stripeAuth: ApiKeyScheme = {
  type: 'apiKey',
  in: 'header',
  name: 'Authorization',
  prefix: 'Bearer ',
};

/** Stripe's list envelope, generic over the resource. */
export interface StripeList<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
  url?: string;
}

/** A Stripe customer, trimmed to the fields config and workflows use. */
export interface StripeCustomer {
  id: string;
  object: 'customer';
  email?: string | null;
  name?: string | null;
  description?: string | null;
  created?: number;
}

/**
 * Live customer picker. Independent of any other prop, and it uses the loader's
 * `search` term when present (Stripe's `customers/search` query syntax) — so it
 * works under today's loader contract and stays fast on large accounts.
 */
export async function customerOptions(
  http: HttpClient,
  auth: AuthHandle,
  search?: string,
): Promise<DropdownOption<string>[]> {
  const url = search ? `${STRIPE_API_BASE}/customers/search` : `${STRIPE_API_BASE}/customers`;
  const query = search ? { query: `name~"${search}" OR email~"${search}"` } : { limit: 100 };
  const res = await http.get<StripeList<StripeCustomer>>(url, { auth, query });
  return res.data.data.map((customer) => ({
    label: `${customer.name ?? customer.id} (${customer.email ?? 'no email'})`,
    value: customer.id,
  }));
}
