import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { isOperationalPermission, OperationalPermission } from './permissions';

@Injectable()
export class OperationalGrantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async grant(
    actorId: string,
    userId: string,
    permission: string,
    resourceType = '',
    resourceId = '',
  ) {
    if (!isOperationalPermission(permission))
      throw new BadRequestException('Unknown operational permission');
    const row = await this.prisma.operational_grants.upsert({
      where: {
        user_id_permission_resource_type_resource_id: {
          user_id: userId,
          permission,
          resource_type: resourceType,
          resource_id: resourceId,
        },
      },
      create: {
        user_id: userId,
        permission,
        resource_type: resourceType,
        resource_id: resourceId,
        granted_by: actorId,
        revoked_at: null,
      },
      update: { revoked_at: null, granted_by: actorId },
    });
    await this.audit.log({
      userId: actorId,
      action: 'operational_grant',
      resource: 'operational_grants',
      resourceId: row.id,
      newValues: { userId, permission, resourceType, resourceId },
      status: 'success',
    });
    return row;
  }

  async has(
    userId: string,
    permission: OperationalPermission,
    resourceType = '',
    resourceId = '',
  ) {
    const row = await this.prisma.operational_grants.findFirst({
      where: {
        user_id: userId,
        permission,
        resource_type: resourceType,
        resource_id: resourceId,
        revoked_at: null,
      },
    });
    return !!row;
  }
}
