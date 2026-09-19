/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_helpers from "../admin/helpers.js";
import type * as admin_mutations from "../admin/mutations.js";
import type * as admin_queries from "../admin/queries.js";
import type * as admin_rules from "../admin/rules.js";
import type * as audit_helpers from "../audit/helpers.js";
import type * as audit_rules from "../audit/rules.js";
import type * as auth from "../auth.js";
import type * as candidates_helpers from "../candidates/helpers.js";
import type * as candidates_mutations from "../candidates/mutations.js";
import type * as candidates_queries from "../candidates/queries.js";
import type * as candidates_rules from "../candidates/rules.js";
import type * as email_helpers from "../email/helpers.js";
import type * as email_mutations from "../email/mutations.js";
import type * as email_queries from "../email/queries.js";
import type * as email_rules from "../email/rules.js";
import type * as http from "../http.js";
import type * as invites_actions from "../invites/actions.js";
import type * as invites_helpers from "../invites/helpers.js";
import type * as invites_mutations from "../invites/mutations.js";
import type * as invites_queries from "../invites/queries.js";
import type * as invites_rules from "../invites/rules.js";
import type * as matchmakers_helpers from "../matchmakers/helpers.js";
import type * as matchmakers_mutations from "../matchmakers/mutations.js";
import type * as matchmakers_queries from "../matchmakers/queries.js";
import type * as matchmakers_rules from "../matchmakers/rules.js";
import type * as seed_dev_fixture from "../seed/dev/fixture.js";
import type * as seed_dev_mutations from "../seed/dev/mutations.js";
import type * as seed_e2e_fixture from "../seed/e2e/fixture.js";
import type * as seed_e2e_mutations from "../seed/e2e/mutations.js";
import type * as users_helpers from "../users/helpers.js";
import type * as users_mutations from "../users/mutations.js";
import type * as users_queries from "../users/queries.js";
import type * as users_rules from "../users/rules.js";
import type * as waitlist_helpers from "../waitlist/helpers.js";
import type * as waitlist_mutations from "../waitlist/mutations.js";
import type * as waitlist_queries from "../waitlist/queries.js";
import type * as waitlist_rules from "../waitlist/rules.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/helpers": typeof admin_helpers;
  "admin/mutations": typeof admin_mutations;
  "admin/queries": typeof admin_queries;
  "admin/rules": typeof admin_rules;
  "audit/helpers": typeof audit_helpers;
  "audit/rules": typeof audit_rules;
  auth: typeof auth;
  "candidates/helpers": typeof candidates_helpers;
  "candidates/mutations": typeof candidates_mutations;
  "candidates/queries": typeof candidates_queries;
  "candidates/rules": typeof candidates_rules;
  "email/helpers": typeof email_helpers;
  "email/mutations": typeof email_mutations;
  "email/queries": typeof email_queries;
  "email/rules": typeof email_rules;
  http: typeof http;
  "invites/actions": typeof invites_actions;
  "invites/helpers": typeof invites_helpers;
  "invites/mutations": typeof invites_mutations;
  "invites/queries": typeof invites_queries;
  "invites/rules": typeof invites_rules;
  "matchmakers/helpers": typeof matchmakers_helpers;
  "matchmakers/mutations": typeof matchmakers_mutations;
  "matchmakers/queries": typeof matchmakers_queries;
  "matchmakers/rules": typeof matchmakers_rules;
  "seed/dev/fixture": typeof seed_dev_fixture;
  "seed/dev/mutations": typeof seed_dev_mutations;
  "seed/e2e/fixture": typeof seed_e2e_fixture;
  "seed/e2e/mutations": typeof seed_e2e_mutations;
  "users/helpers": typeof users_helpers;
  "users/mutations": typeof users_mutations;
  "users/queries": typeof users_queries;
  "users/rules": typeof users_rules;
  "waitlist/helpers": typeof waitlist_helpers;
  "waitlist/mutations": typeof waitlist_mutations;
  "waitlist/queries": typeof waitlist_queries;
  "waitlist/rules": typeof waitlist_rules;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  www: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"www">;
  app: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"app">;
  admin: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"admin">;
};
