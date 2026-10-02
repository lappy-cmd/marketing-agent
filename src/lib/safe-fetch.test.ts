import { describe, expect, it } from "vitest";
import { fetchImage, isPublicAddress } from "./safe-fetch";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:c0a8:101",
    "64:ff9b::7f00:1",
    "not-an-ip",
    "",
  ])("rejects %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(["8.8.8.8", "172.32.0.1", "104.18.2.3", "2606:4700:4700::1111", "::ffff:8.8.8.8", "::ffff:808:808"])(
    "accepts %s",
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );
});

describe("fetchImage", () => {
  it.each(["http://example.com/a.jpg", "https://127.0.0.1/a.jpg", "https://[::1]/a.jpg", "https://localhost/a.jpg", "nonsense"])(
    "refuses %s before making a request",
    async (url) => {
      await expect(fetchImage(url)).rejects.toThrow(/https|allowed|valid/);
    },
  );
});
