// The VAPID public key is served base64url, and PushManager.subscribe wants
// raw bytes. Browsers still have no built-in base64url decoder, so this is the
// conversion every push implementation ends up writing.
export function decodeVapidKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);

  // Backed by an explicit ArrayBuffer: PushManager.subscribe takes a
  // BufferSource, which excludes the SharedArrayBuffer-backed form that
  // `new Uint8Array(length)` widens to.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
