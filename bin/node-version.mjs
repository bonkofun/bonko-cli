export const minimumNode = '22.12.0';
/** @param {string} version */
export function supportsNode(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [major, minor] = match.slice(1).map(Number);
  return major > 22 || (major === 22 && minor >= 12);
}
/** @param {string} version */
export function nodeVersionError(version) {
  return `Bonko requires Node.js >= ${minimumNode}; found ${version}. Install or upgrade Node.js at https://nodejs.org/en/download, then retry. No installation was performed.`;
}
