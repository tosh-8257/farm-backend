import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { listQuery } from './list-query';
import { PrismaService } from '../database/prisma.service';
import { httpsImageUrl } from './catalogue';
import { CommerceService } from './commerce.service';

@Injectable()
export class CatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commerce: CommerceService,
  ) {}

  async createProduct(
    userId: string,
    input: { name: string; category?: string; description?: string },
  ) {
    const supplier = await this.commerce.ownSupplier(userId);
    if (['rejected', 'suspended'].includes(supplier.status))
      throw new ForbiddenException('This supplier cannot add products');
    const name = input.name?.trim();
    if (!name || name.length < 2)
      throw new BadRequestException('Product name is required');
    const product = await this.prisma.supplier_products.create({
      data: {
        supplier_id: supplier.id,
        name,
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        status: 'draft',
      },
    });
    return { data: product };
  }

  async listOwn(
    userId: string,
    query: { page?: string; limit?: string; sort?: string; status?: string } = {},
  ) {
    const supplier = await this.commerce.ownSupplier(userId);
    const list = listQuery(query);
    const products = await this.prisma.supplier_products.findMany({
      where: {
        supplier_id: supplier.id,
        ...(list.status ? { status: list.status } : {}),
      },
      include: { variants: true },
      orderBy: { created_at: list.order },
      skip: list.skip,
      take: list.limit,
    });
    return { data: products, meta: { page: list.page, limit: list.limit, sort: list.order } };
  }

  async addVariant(
    userId: string,
    productId: string,
    input: {
      sku: string;
      wholesalePrice: number;
      stock: number;
      imageUrl?: string;
    },
  ) {
    const supplier = await this.commerce.ownSupplier(userId);
    const product = await this.ownedProduct(supplier.id, productId);
    const sku = input.sku?.trim();
    if (!sku) throw new BadRequestException('SKU is required');
    if (!(input.wholesalePrice > 0))
      throw new BadRequestException('Wholesale price must be positive');
    if (!Number.isInteger(input.stock) || input.stock < 0)
      throw new BadRequestException('Stock must be a whole number');
    try {
      const variant = await this.prisma.product_variants.create({
        data: {
          product_id: product.id,
          sku,
          wholesale_price: input.wholesalePrice,
          stock: input.stock,
          image_url: httpsImageUrl(input.imageUrl),
        },
      });
      return { data: variant };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException('That SKU already exists on this product');
      throw e;
    }
  }

  async publish(userId: string, productId: string) {
    const supplier = await this.commerce.ownSupplier(userId);
    if (supplier.status !== 'approved')
      throw new ForbiddenException('Only an approved supplier can publish');
    const product = await this.ownedProduct(supplier.id, productId);
    const variants = await this.prisma.product_variants.count({
      where: { product_id: product.id },
    });
    if (!variants)
      throw new BadRequestException('Add a variant before publishing');
    const updated = await this.prisma.supplier_products.update({
      where: { id: product.id },
      data: { status: 'active' },
    });
    return { data: updated };
  }

  /**
   * Sets on-hand stock. The same key returns the first write and does not
   * apply a second time. Stock cannot fall below units already reserved.
   */
  async setStock(
    userId: string,
    variantId: string,
    input: { idempotencyKey: string; stock: number },
  ) {
    const supplier = await this.commerce.ownSupplier(userId);
    if (!input.idempotencyKey || input.idempotencyKey.length < 8)
      throw new BadRequestException('Idempotency key is required');
    if (!Number.isInteger(input.stock) || input.stock < 0)
      throw new BadRequestException('Stock must be a whole number');
    const variant = await this.prisma.product_variants.findFirst({
      where: { id: variantId, product: { supplier_id: supplier.id } },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    const prior = await this.prisma.variant_stock_writes.findUnique({
      where: {
        variant_id_idempotency_key: {
          variant_id: variantId,
          idempotency_key: input.idempotencyKey,
        },
      },
    });
    if (prior) {
      const current = await this.prisma.product_variants.findUnique({
        where: { id: variantId },
      });
      return { replayed: true, data: current };
    }
    if (input.stock < variant.reserved)
      throw new ConflictException('Stock cannot be below reserved units');
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.variant_stock_writes.create({
          data: {
            variant_id: variantId,
            idempotency_key: input.idempotencyKey,
            stock: input.stock,
          },
        });
        return tx.product_variants.update({
          where: { id: variantId },
          data: { stock: input.stock },
        });
      });
      return { replayed: false, data: updated };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const current = await this.prisma.product_variants.findUnique({
          where: { id: variantId },
        });
        return { replayed: true, data: current };
      }
      throw e;
    }
  }

  async search(
    userId: string,
    query: {
      q?: string;
      category?: string;
      page?: string;
      limit?: string;
      sort?: string;
    },
  ) {
    await this.commerce.approvedMerchant(userId);
    const q = query.q?.trim();
    const category = query.category?.trim();
    const list = listQuery({
      ...query,
      sort: query.sort === 'desc' ? 'desc' : 'asc',
    });
    const products = await this.prisma.supplier_products.findMany({
      where: {
        status: 'active',
        supplier: { status: 'approved' },
        ...(category
          ? { category: { equals: category, mode: 'insensitive' } }
          : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                {
                  variants: {
                    some: { sku: { contains: q, mode: 'insensitive' } },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        variants: true,
        supplier: { select: { id: true, legal_name: true, region: true } },
      },
      take: list.limit,
      skip: list.skip,
      orderBy: { name: list.order },
    });
    return {
      data: products,
      meta: {
        eta: null,
        maps_verified: false,
        page: list.page,
        limit: list.limit,
        sort: list.order,
      },
    };
  }

  private async ownedProduct(supplierId: string, productId: string) {
    const product = await this.prisma.supplier_products.findFirst({
      where: { id: productId, supplier_id: supplierId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
}
