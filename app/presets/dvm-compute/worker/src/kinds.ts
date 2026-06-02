// Event kinds used by the compute DVM. See README for how they relate.
export const KIND = {
  // NIP-C0: the reusable code source lives here (addressable, updateable by its author).
  codeSnippet: 1337,
  // Addressable "data function" definition: references a codeSnippet + bundles source relays,
  // output relay, default params, subject and ttl. This is the unit clients reference.
  dataFunction: 31338,
  // NIP-90: client asks the DVM to run a data function (points at a dataFunction by `a`).
  jobRequest: 5910,
  // NIP-90: DVM returns the result (points at the cached event below).
  jobResult: 6910,
  // NIP-90: DVM status/errors for a request.
  jobFeedback: 7000,
  // Custom addressable cached output. `d` = hash(script + inputs + source relays).
  cachedResult: 31337,
} as const

export type Kind = (typeof KIND)[keyof typeof KIND]
