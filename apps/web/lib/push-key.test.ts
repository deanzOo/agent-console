import { describe, expect, it } from "vitest";
import { decodeVapidKey } from "./push-key";

// A real VAPID public key is 65 bytes: an uncompressed P-256 point, 0x04 then
// the two coordinates. Getting the length or the first byte wrong makes
// subscribe() throw with a message that blames the browser.
function vapidLikeKey(): { base64Url: string; bytes: Uint8Array } {
  const bytes = new Uint8Array(65);
  bytes[0] = 0x04;
  for (let i = 1; i < 65; i += 1) bytes[i] = (i * 7) % 256;

  const base64Url = Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return { base64Url, bytes };
}

describe("decodeVapidKey", () => {
  it("round-trips a key of the shape the push service issues", () => {
    const { base64Url, bytes } = vapidLikeKey();
    const decoded = decodeVapidKey(base64Url);

    expect(decoded).toEqual(bytes);
    expect(decoded).toHaveLength(65);
    expect(decoded[0]).toBe(0x04);
  });

  it("restores padding the base64url form omits", () => {
    // "aGk" is "hi" with its single "=" stripped — atob rejects it unpadded.
    expect(Array.from(decodeVapidKey("aGk"))).toEqual([104, 105]);
  });

  it("translates the url-safe alphabet back", () => {
    // 0xfb 0xff encodes as "+/8" in standard base64 and "-_8" url-safe.
    expect(Array.from(decodeVapidKey("-_8"))).toEqual([251, 255]);
  });
});
