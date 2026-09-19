import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    author: v.string(),
    body: v.string(),
  }),

  // Sign-ups from the marketing site (apps/www). Written only by
  // `waitlist.join`; nothing public reads it back.
  waitlist: defineTable({
    email: v.string(), // trimmed + lowercased, unique by convention
    name: v.optional(v.string()),
    instagram: v.optional(v.string()), // handle without the leading "@"
    source: v.string(), // which form on the site, e.g. "landing"
  }).index("by_email", ["email"]),
});
