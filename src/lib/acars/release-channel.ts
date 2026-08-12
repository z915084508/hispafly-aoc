export type AcarsReleaseChannel = "STABLE" | "BETA";

export function effectiveAcarsReleaseChannel(
  publishedChannel: AcarsReleaseChannel | null,
  version: string,
): AcarsReleaseChannel {
  if (publishedChannel) return publishedChannel;
  return /(?:^|[-.])(beta|alpha|rc)(?:[.-]|$)/i.test(version) ? "BETA" : "STABLE";
}
