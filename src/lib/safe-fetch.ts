import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Downloads an image from a URL the browser handed us. Because the server is
// fetching an arbitrary address, every hop is checked to be a public https
// host so this can't be pointed at localhost or the local network.

export class ImageFetchError extends Error {}

const MAX_REDIRECTS = 3;
const MAX_BYTES = 10_000_000;
const TIMEOUT_MS = 10_000;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function isPublicV4(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this-network, private, loopback, multicast/reserved
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local (cloud metadata lives here)
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && c === 0) return false; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  return true;
}

export function isPublicAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPublicV4(ip);
  if (version !== 6) return false;

  const v6 = ip.toLowerCase();
  // IPv4-mapped (::ffff:1.2.3.4 or ::ffff:102:304) is judged as the IPv4 address.
  const mapped = v6.match(/^::ffff:(.+)$/);
  if (mapped) {
    if (mapped[1].includes(".")) return isIP(mapped[1]) === 4 && isPublicV4(mapped[1]);
    const [hi, lo] = mapped[1].split(":").map((h) => parseInt(h, 16));
    return isPublicV4([hi >> 8, hi & 255, lo >> 8, lo & 255].join("."));
  }
  if (v6 === "::" || v6 === "::1") return false; // unspecified, loopback
  if (/^f[cd]/.test(v6)) return false; // unique local
  if (/^fe[89ab]/.test(v6)) return false; // link-local
  if (v6.startsWith("ff")) return false; // multicast
  if (v6.startsWith("64:ff9b:")) return false; // NAT64, can reach IPv4 hosts
  return true;
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:") throw new ImageFetchError("Only https images can be imported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new ImageFetchError("That image address isn't allowed.");
  }
}

async function readCapped(res: Response): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(res.headers.get("content-length")) > MAX_BYTES) throw new ImageFetchError("That image is too large.");
  const reader = res.body?.getReader();
  if (!reader) throw new ImageFetchError("The image was empty.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new ImageFetchError("That image is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function fetchImage(rawUrl: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ImageFetchError("That isn't a valid image address.");
  }
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  try {
    // Redirects are followed by hand so each hop gets the same address check.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublic(url);
      const res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: { Accept: ALLOWED_TYPES.join(","), "User-Agent": "Mozilla/5.0 (compatible; MarketingAgent/0.1)" },
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      if (!res.ok) throw new ImageFetchError(`The image host refused the download (${res.status}).`);
      const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!ALLOWED_TYPES.includes(contentType)) throw new ImageFetchError("That file isn't a JPG, PNG or WebP image.");
      return { bytes: await readCapped(res), contentType };
    }
    throw new ImageFetchError("The image redirected too many times.");
  } catch (error) {
    if (error instanceof ImageFetchError) throw error;
    throw new ImageFetchError("Couldn't download that image.");
  }
}
