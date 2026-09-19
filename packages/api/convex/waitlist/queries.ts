import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { internalQuery } from "../_generated/server";
import schema from "../schema";

/**
 * Sign-ups, newest first. Internal: the waitlist holds personal data and
 * nothing on the public API reads it back. Run it from the Convex dashboard or
 * `npx convex run waitlist/queries:list '{"paginationOpts":{"numItems":50,"cursor":null}}'`.
 */
export const list = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("waitlist")),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("waitlist")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
