import type { Db } from "./db";
import { pushChannel } from "./push";
import { getSetting } from "./settings";
import type { Deliverer, Notification } from "./notify";

export function telegramChannel(token: string, chatId: string): Deliverer {
  return {
    name: "telegram",
    async send(message: Notification): Promise<void> {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `*${message.title}*\n${message.body}`,
          parse_mode: "Markdown",
        }),
      });
      if (!response.ok) {
        throw new Error(`Telegram responded ${response.status}`);
      }
    },
  };
}

export function configuredChannels(db: Db): Deliverer[] {
  const channels: Deliverer[] = [];

  const botToken = getSetting(db, "telegram_bot_token");
  const chatId = getSetting(db, "telegram_chat_id");
  if (botToken && chatId) channels.push(telegramChannel(botToken, chatId));

  const publicKey = getSetting(db, "vapid_public_key");
  const privateKey = getSetting(db, "vapid_private_key");
  const subject = getSetting(db, "vapid_subject") ?? "mailto:admin@example.invalid";
  if (publicKey && privateKey) {
    try {
      channels.push(pushChannel(db, { publicKey, privateKey, subject }));
    } catch {
      // A malformed keypair disables push only. Letting it throw here would
      // take every other channel down with it.
    }
  }

  return channels;
}
