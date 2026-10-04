import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/** Set to 1 to analyse pages on localhost or the local network, such as a dev server. */
const ALLOW_PRIVATE = process.env["UNRENDERED_ALLOW_PRIVATE_HOSTS"] === "1";

// The URL comes from a model that may have read a hostile page, so by default it may not reach this machine or its network.
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 3],
] as const) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 127],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) blocked.addSubnet(net, prefix, "ipv6");

const isBlocked = (address: string): boolean => {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped !== undefined) return blocked.check(mapped, "ipv4");
  return blocked.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
};

/** Throws when the URL's host is, or resolves to, a loopback, private, link-local or multicast address. */
export async function assertPublicHost(url: string): Promise<void> {
  if (ALLOW_PRIVATE) return;
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.some(isBlocked)) {
    throw new Error(`${host} is a local or private network address. Set UNRENDERED_ALLOW_PRIVATE_HOSTS=1 to analyse it.`);
  }
}
