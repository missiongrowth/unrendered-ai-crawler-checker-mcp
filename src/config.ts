/**
 * Every tunable constant lives here. Values are calibrated against test/fixtures
 * and the real-site set; change them only with a test that shows why.
 */
export const CONFIG = {
  /** DOM must stay free of mutations this long before the snapshot is taken. */
  settleQuietMs: 1000,
  /** Snapshot is taken at this point even if the DOM never settles. */
  settleMaxMs: 8000,
  /** Raw responses larger than this are truncated before parsing. */
  rawMaxBytes: 5 * 1024 * 1024,
  /** A block needs at least this share of its tokens aligned in order to count as `partial`. */
  partialMinShare: 0.5,
  /** Blocks shorter than this are matched by exact text, or in raw order together with a neighbouring block; never by partial overlap or data containment. */
  minTokensForFuzzy: 4,
  /** Raw tokens scanned around an alignment gap when looking for a partial match. */
  partialWindowTokens: 4000,
  /** Show the "content depends on your cookies" notice when sending cookies raises all-text coverage by at least this share. */
  cookieLiftNotice: 0.1,
} as const;
