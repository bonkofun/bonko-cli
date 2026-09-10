import type { TemplateSubmission } from '@bonko/template-sdk/submission';

/** Optional authoring metadata; existing drafts without demo photos remain buildable. */
export function validatePreviewPhotos(
  manifest: Pick<TemplateSubmission, 'config' | 'assets' | 'cover' | 'sample'>,
) {
  const keys = Object.keys(manifest.config).filter((key) => key.startsWith('previewPhoto'));
  const captionKeys = Object.keys(manifest.config).filter((key) =>
    key.startsWith('previewCaption'),
  );
  if (!keys.length && !captionKeys.length) return;
  for (const [field, limit] of [
    ['recipientName', 30],
    ['message', 160],
    ['senderName', 30],
  ] as const) {
    const text = manifest.sample[field];
    if (typeof text !== 'string' || !text.trim() || text.length > limit)
      throw new Error(
        `sample.${field} must contain 1–${limit} characters for demonstration previews`,
      );
  }
  const max = manifest.config.maxPhotos ?? 1;
  if (!Number.isInteger(max) || Number(max) < 1 || Number(max) > 10)
    throw new Error('Preview photos require maxPhotos between 1 and 10');
  const paths = new Set<string>();
  for (let index = 1; index <= Number(max); index++) {
    const id = manifest.config[`previewPhoto${index}`];
    const asset =
      typeof id === 'string' && Object.hasOwn(manifest.assets, id)
        ? manifest.assets[id]
        : undefined;
    if (!asset || asset.kind !== 'image')
      throw new Error(`previewPhoto${index} must reference a declared image asset`);
    if (asset.path === manifest.assets[manifest.cover]?.path || paths.has(asset.path))
      throw new Error('Preview photos must be distinct images separate from the catalog cover');
    const caption = manifest.config[`previewCaption${index}`];
    if (typeof caption !== 'string' || !caption.trim() || caption.length > 80)
      throw new Error(`previewCaption${index} must contain 1–80 characters`);
    paths.add(asset.path);
  }
  if (
    captionKeys.length !== Number(max) ||
    captionKeys.some((key) => !/^previewCaption([1-9]|10)$/.test(key))
  )
    throw new Error('Preview captions must match the photo slots');
  if (keys.length !== Number(max) || keys.some((key) => !/^previewPhoto([1-9]|10)$/.test(key)))
    throw new Error('Preview photos must be consecutively numbered from 1 through maxPhotos');
}

/** Demo metadata belongs to the host; reserve runtime config space for real photo notes. */
export function withoutPreviewMetadata(config: TemplateSubmission['config']) {
  return Object.fromEntries(
    Object.entries(config).filter(
      ([key]) =>
        !key.startsWith('previewPhoto') &&
        !key.startsWith('previewCaption') &&
        key !== 'suggestedPriceCents' &&
        key !== 'suggestedPriceCurrency',
    ),
  );
}
