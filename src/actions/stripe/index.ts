export { customerOptions, STRIPE_API_BASE, type StripeCustomer, type StripeList, stripeAuth } from './common';
export {
  GET_BALANCE_TYPE,
  GET_CUSTOMER_TYPE,
  getBalance,
  getCustomer,
  LIST_CHARGES_TYPE,
  LIST_CUSTOMERS_TYPE,
  LIST_SUBSCRIPTIONS_TYPE,
  listCharges,
  listCustomers,
  listSubscriptions,
  SEARCH_CUSTOMERS_TYPE,
  searchCustomers,
  type StripeBalance,
  type StripeCharge,
  type StripeSubscription,
} from './reads';

import {
  getBalance,
  getCustomer,
  listCharges,
  listCustomers,
  listSubscriptions,
  searchCustomers,
} from './reads';

/** Every Stripe action, for catalog builds and registration. Reads only this run (form-body gap). */
export const stripeActions = [
  getCustomer,
  listCustomers,
  searchCustomers,
  listCharges,
  listSubscriptions,
  getBalance,
] as const;
