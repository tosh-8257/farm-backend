import { BadRequestException } from '@nestjs/common';

/** Supplier-supplied image. https only. No file bytes are stored here. */
export function httpsImageUrl(raw: string | undefined | null) {
  if (raw == null || raw.trim() === '') return null;
  if (raw.length > 500) throw new BadRequestException('Image URL is too long');
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequestException('Image URL must be https');
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new BadRequestException('Image URL must be https');
  return url.toString();
}
