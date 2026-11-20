import { randomBytes } from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Short public code. The UUID stays the primary key. Easy to replace later. */
export function newBusinessPublicCode() {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isBusinessUuid(value: string) {
  return UUID.test(value.trim());
}

/** Assign a code when an older business has none. Retries on the rare collision. */
export async function assignBusinessPublicCode(
  prisma: {
    businesses: {
      update: (args: {
        where: { id: string };
        data: { public_code: string };
      }) => Promise<unknown>;
    };
  },
  businessId: string,
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const public_code = newBusinessPublicCode();
    try {
      await prisma.businesses.update({
        where: { id: businessId },
        data: { public_code },
      });
      return public_code;
    } catch {
      /* unique collision */
    }
  }
  return null;
}
