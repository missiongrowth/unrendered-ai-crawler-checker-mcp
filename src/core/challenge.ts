export interface Challenge {
  vendor: string;
  header: string;
  value: string;
}

/**
 * Response headers that a vendor documents as marking a challenge or block
 * response. Body text and headers that every protected response carries are
 * not used: they are undocumented or do not mean the request was stopped.
 * Non-2xx blocks are reported by their status instead.
 */
const MARKERS: readonly { vendor: string; header: string; values: readonly string[] | null }[] = [
  // https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/
  { vendor: "Cloudflare", header: "cf-mitigated", values: ["challenge"] },
  // https://docs.aws.amazon.com/waf/latest/developerguide/waf-captcha-and-challenge-actions.html (Challenge is sent with status 202)
  { vendor: "AWS WAF", header: "x-amzn-waf-action", values: ["challenge", "captcha"] },
  // https://docs.datadome.co/docs/sdk-android ("identify a challenge response with the presence of an X-DD-B header")
  { vendor: "DataDome", header: "x-dd-b", values: null },
];

export function detectChallenge(headers: Headers): Challenge | null {
  for (const { vendor, header, values } of MARKERS) {
    const value = headers.get(header);
    if (value !== null && (values === null || values.includes(value.trim().toLowerCase()))) return { vendor, header, value };
  }
  return null;
}
