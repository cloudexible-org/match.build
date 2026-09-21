/**
 * Every page object, namespaced by the app it drives.
 *
 *   import { POM } from "@repo/harness/page-objects";
 *   const chat = new POM.App.ConversationPage(page);
 *
 * A spec that only wants one may still import the file directly
 * (`@repo/harness/page-objects/app/matches.page`); this exists so a marketing
 * capture can pull in a handful of screens without a line of imports per
 * screen, and so there is one place that lists what the suite can drive.
 *
 * Namespaced rather than flat because the three apps name their screens
 * independently — both `apps/app` and `apps/admin` have a sign-in page, and a
 * flat re-export would force one of them to be renamed here, away from the
 * name the spec that owns it uses.
 */

import * as Admin from "./admin";
import * as App from "./app";
import * as Www from "./www";

export const POM = { App, Admin, Www };
export { Admin, App, Www };
