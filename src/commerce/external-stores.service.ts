import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type StorePlatform = 'shopify' | 'woocommerce';

export function storeFlag(platform: StorePlatform) {
  return platform === 'shopify' ? 'SHOPIFY_ENABLED' : 'WOOCOMMERCE_ENABLED';
}

/**
 * Saving a shop domain does not verify it. Sync never calls Shopify or
 * WooCommerce in this build, even when the flag is on.
 */
@Injectable()
export class ExternalStoresService {
  constructor(private readonly prisma: PrismaService) {}

  async connect(
    businessId: string,
    platform: StorePlatform,
    shopDomain: string,
  ) {
    const domain = shopDomain.trim().toLowerCase();
    if (!domain || domain.length > 255)
      throw new BadRequestException('Shop domain is required');
    if (platform !== 'shopify' && platform !== 'woocommerce')
      throw new BadRequestException('Platform must be shopify or woocommerce');
    const enabled = process.env[storeFlag(platform)] === 'true';
    const row = await this.prisma.external_store_connections.upsert({
      where: {
        business_id_platform_shop_domain: {
          business_id: businessId,
          platform,
          shop_domain: domain,
        },
      },
      create: {
        business_id: businessId,
        platform,
        shop_domain: domain,
        status: 'unverified',
      },
      update: { status: 'unverified' },
    });
    return {
      connection: row,
      enabled,
      verified: false as const,
      note: enabled
        ? 'Flag is on, but credentials have not been verified. Sync stays refused.'
        : `${storeFlag(platform)} is not true. The connection is stored as unverified.`,
    };
  }

  async sync(businessId: string, connectionId: string) {
    const connection = await this.prisma.external_store_connections.findFirst({
      where: { id: connectionId, business_id: businessId },
    });
    if (!connection) throw new BadRequestException('Connection not found');
    const reason =
      'Sync refused. Shopify and WooCommerce are not verified and no provider call is made.';
    await this.prisma.external_store_sync_jobs.create({
      data: { connection_id: connectionId, status: 'refused', reason },
    });
    throw new ServiceUnavailableException({
      message: reason,
      verified: false,
      platform: connection.platform,
    });
  }
}
