// Convex Auth issues session JWTs signed with JWT_PRIVATE_KEY, with this
// deployment's `.convex.site` URL as the issuer. Convex validates them via the
// OpenID discovery document convex/http.ts serves at
// `<site>/.well-known/openid-configuration`.
//
// Only CONVEX_SITE_URL is referenced here. It is built in on every
// deployment, so this never fails a deploy for a missing env var.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
