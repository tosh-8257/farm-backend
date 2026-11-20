import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * One open job can be claimed by one approved partner. The status update is
 * conditional, so two assigns cannot both succeed.
 */
@Injectable()
export class DispatchService {
  constructor(private readonly prisma: PrismaService) {}

  async openJob(shipmentId: string) {
    const existing = await this.prisma.delivery_jobs.findUnique({
      where: { shipment_id: shipmentId },
    });
    if (existing) return existing;
    return this.prisma.delivery_jobs.create({
      data: { shipment_id: shipmentId, status: 'open' },
    });
  }

  async assign(jobId: string, partnerId: string, now = new Date()) {
    const partner = await this.prisma.delivery_partner_profiles.findUnique({
      where: { id: partnerId },
    });
    if (!partner) throw new NotFoundException('Partner not found');
    if (partner.status !== 'approved')
      throw new BadRequestException('Only an approved partner can take a job');
    if (partner.document_expires_at && partner.document_expires_at <= now)
      throw new BadRequestException('Partner documents are expired');
    const claim = await this.prisma.delivery_jobs.updateMany({
      where: { id: jobId, status: 'open' },
      data: { status: 'assigned' },
    });
    if (!claim.count)
      throw new ConflictException('This job is no longer open');
    return this.prisma.delivery_assignments.create({
      data: { job_id: jobId, partner_id: partnerId },
    });
  }
}
