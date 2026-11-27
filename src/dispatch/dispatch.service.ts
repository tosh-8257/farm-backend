import { createHash, randomInt } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { cargoTransition } from '../cargo/cargo.service';
import { EcosystemNotifyService } from '../notifications/ecosystem-notify.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * One open job can be claimed by one approved partner. The status update is
 * conditional, so two assigns cannot both succeed.
 */
@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit?: AuditLogService,
    @Optional() private readonly notify?: EcosystemNotifyService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

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
    const assignment = await this.prisma.delivery_assignments.create({
      data: { job_id: jobId, partner_id: partnerId },
    });
    await this.notify?.once(
      partner.user_id,
      `job:${jobId}:assigned`,
      'Delivery job',
      'A delivery job assigned to you was updated.',
    );
    return assignment;
  }

  async reassign(jobId: string, partnerId: string, adminId: string, now = new Date()) {
    await this.requireEligible(partnerId, now);
    const job = await this.prisma.delivery_jobs.findUnique({
      where: { id: jobId },
      include: { assignment: true },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== 'assigned' || !job.assignment)
      throw new ConflictException('Only an assigned job can be reassigned');
    if (job.assignment.partner_id === partnerId)
      return { replayed: true, assignment: job.assignment };
    const updated = await this.prisma.delivery_assignments.update({
      where: { job_id: jobId },
      data: { partner_id: partnerId },
    });
    await this.prisma.delivery_job_events.create({
      data: {
        job_id: jobId,
        status: 'reassigned',
        note: 'Admin moved the job to another partner',
      },
    });
    await this.audit?.log({
      userId: adminId,
      action: 'dispatch_reassign',
      resource: 'delivery_jobs',
      resourceId: jobId,
      oldValues: { partner_id: job.assignment.partner_id },
      newValues: { partner_id: partnerId },
      status: 'success',
    });
    return { replayed: false, assignment: updated };
  }

  async fail(jobId: string, reason: string, adminId: string) {
    const note = reason?.trim();
    if (!note) throw new BadRequestException('A reason is required');
    const job = await this.prisma.delivery_jobs.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status === 'failed') return { replayed: true, job };
    const claim = await this.prisma.delivery_jobs.updateMany({
      where: { id: jobId, status: { in: ['open', 'assigned'] } },
      data: { status: 'failed' },
    });
    if (!claim.count)
      throw new ConflictException('This job cannot be marked failed');
    const shipment = await this.prisma.cargo_shipments.findUnique({
      where: { id: job.shipment_id },
    });
    if (shipment && cargoTransition(shipment.status, 'failed')) {
      await this.prisma.cargo_shipments.update({
        where: { id: shipment.id },
        data: {
          status: 'failed',
          events: { create: { status: 'failed', note } },
        },
      });
    }
    await this.prisma.delivery_job_events.create({
      data: { job_id: jobId, status: 'failed', note },
    });
    await this.audit?.log({
      userId: adminId,
      action: 'dispatch_failed',
      resource: 'delivery_jobs',
      resourceId: jobId,
      newValues: { status: 'failed' },
      status: 'success',
    });
    return { replayed: false, job: { ...job, status: 'failed' } };
  }

  async recordProof(
    userId: string,
    jobId: string,
    input: { method: 'otp' | 'signature' | 'photo'; reference?: string },
  ) {
    const job = await this.prisma.delivery_jobs.findUnique({
      where: { id: jobId },
      include: { assignment: true, proof: true },
    });
    if (!job?.assignment) throw new NotFoundException('Job is not assigned');
    const partner = await this.prisma.delivery_partner_profiles.findUnique({
      where: { id: job.assignment.partner_id },
    });
    if (!partner || partner.user_id !== userId)
      throw new ForbiddenException('Only the assigned partner can record proof');
    if (job.proof?.verified_at)
      return { replayed: true, data: { method: job.proof.method, verified: true } };
    if (job.proof) throw new ConflictException('Proof was already recorded');
    if (input.method === 'otp') {
      const otp = String(randomInt(100000, 1000000));
      await this.prisma.proof_of_delivery.create({
        data: {
          job_id: jobId,
          method: 'otp',
          code_hash: createHash('sha256').update(otp).digest('hex'),
        },
      });
      const shipment = await this.prisma.cargo_shipments.findUnique({
        where: { id: job.shipment_id },
      });
      if (shipment?.user_id) {
        await this.notifications?.createInApp(shipment.user_id, {
          type: 'system',
          title: 'Delivery code',
          body: `Your delivery code is ${otp}. Give it only to the person handing you the parcel.`,
          entityId: jobId,
        });
      }
      return {
        replayed: false,
        data: { method: 'otp', sent_to_recipient: true, verified: false },
      };
    }
    const reference = input.reference?.trim();
    if (!reference) throw new BadRequestException('A reference is required');
    if (input.method === 'photo' && !reference.startsWith('https://'))
      throw new BadRequestException('Photo proof must be an https URL');
    await this.prisma.proof_of_delivery.create({
      data: { job_id: jobId, method: input.method, reference },
    });
    return {
      replayed: false,
      data: { method: input.method, verified: false },
    };
  }

  async verifyProof(userId: string, jobId: string, code: string) {
    const job = await this.prisma.delivery_jobs.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('Job not found');
    const shipment = await this.prisma.cargo_shipments.findUnique({
      where: { id: job.shipment_id },
    });
    if (!shipment || shipment.user_id !== userId)
      throw new ForbiddenException('Only the recipient can verify this code');
    const proof = await this.prisma.proof_of_delivery.findUnique({
      where: { job_id: jobId },
    });
    if (!proof || proof.method !== 'otp' || !proof.code_hash)
      throw new NotFoundException('No OTP proof is waiting');
    if (proof.verified_at) return { replayed: true, verified: true };
    if ((proof.failed_attempts ?? 0) >= 5)
      throw new BadRequestException('Too many attempts');
    const hash = createHash('sha256').update(code.trim()).digest('hex');
    if (hash !== proof.code_hash) {
      await this.prisma.proof_of_delivery.update({
        where: { job_id: jobId },
        data: { failed_attempts: { increment: 1 } },
      });
      throw new BadRequestException('The code does not match');
    }
    await this.prisma.proof_of_delivery.update({
      where: { job_id: jobId },
      data: { verified_at: new Date() },
    });
    return { replayed: false, verified: true };
  }

  private async requireEligible(partnerId: string, now: Date) {
    const partner = await this.prisma.delivery_partner_profiles.findUnique({
      where: { id: partnerId },
    });
    if (!partner) throw new NotFoundException('Partner not found');
    if (partner.status !== 'approved')
      throw new BadRequestException('Only an approved partner can take a job');
    if (partner.document_expires_at && partner.document_expires_at <= now)
      throw new BadRequestException('Partner documents are expired');
    return partner;
  }
}
