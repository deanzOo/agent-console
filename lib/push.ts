import webpush from "web-push";
import { eq } from "drizzle-orm";
import type { Db } from "./db";
import { pushSubscriptions } from "./schema";
import type { Deliverer, Notification } from "./notify";

export function pushChannel(
  db: Db,
  keys: {
    publicKey: string;
    privateKey: string;
    subject: string;
  },
): Deliverer {
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);

  return {
    name: "push",
    async send(message: Notification): Promise<void> {
      const subscriptions = db.select().from(pushSubscriptions).all();
      const payload = JSON.stringify(message);

      const results = await Promise.allSettled(
        subscriptions.map(async (row) => {
          const keysJson: unknown = JSON.parse(row.keysJson);
          const auth = Object(keysJson);
          try {
            await webpush.sendNotification(
              {
                endpoint: row.endpoint,
                keys: { p256dh: auth.p256dh, auth: auth.auth },
              },
              payload,
            );
          } catch (error) {
            // 404/410 mean the browser dropped the subscription for good.
            const status = Object(error).statusCode;
            if (status === 404 || status === 410) {
              db.delete(pushSubscriptions)
                .where(eq(pushSubscriptions.endpoint, row.endpoint))
                .run();
              return;
            }
            throw error;
          }
        }),
      );

      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length > 0 && failed.length === results.length) {
        throw new Error(`All ${failed.length} push deliveries failed`);
      }
    },
  };
}
