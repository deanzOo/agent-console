import { describe, expect, it } from "vitest";
import { getFeatures } from "./features";

describe("getFeatures", () => {
  it("enables nothing when no credentials are configured", () => {
    expect(getFeatures({})).toEqual({
      github: false,
      asana: false,
      push: false,
      telegram: false,
    });
  });

  it("enables github with a token", () => {
    expect(getFeatures({ githubToken: "t" }).github).toBe(true);
  });

  it("enables asana with a token", () => {
    expect(getFeatures({ asanaToken: "t" }).asana).toBe(true);
  });

  it("treats a blank credential as unconfigured", () => {
    expect(getFeatures({ githubToken: "   " }).github).toBe(false);
  });

  it("leaves other features off when one is configured", () => {
    const features = getFeatures({ githubToken: "t" });
    expect(features.asana).toBe(false);
    expect(features.push).toBe(false);
    expect(features.telegram).toBe(false);
  });

  describe("push", () => {
    it("requires both VAPID keys", () => {
      expect(getFeatures({ vapidPublicKey: "pub", vapidPrivateKey: "priv" }).push).toBe(
        true,
      );
    });

    it("stays off with only the public key", () => {
      expect(getFeatures({ vapidPublicKey: "pub" }).push).toBe(false);
    });

    it("stays off with only the private key", () => {
      expect(getFeatures({ vapidPrivateKey: "priv" }).push).toBe(false);
    });
  });

  describe("telegram", () => {
    it("requires both the bot token and the chat id", () => {
      expect(
        getFeatures({ telegramBotToken: "bot", telegramChatId: "123" }).telegram,
      ).toBe(true);
    });

    it("stays off without a chat id, since there is nowhere to send", () => {
      expect(getFeatures({ telegramBotToken: "bot" }).telegram).toBe(false);
    });

    it("stays off without a bot token", () => {
      expect(getFeatures({ telegramChatId: "123" }).telegram).toBe(false);
    });
  });
});
