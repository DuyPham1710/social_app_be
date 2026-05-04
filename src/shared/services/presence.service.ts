import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/modules/user/schemas/user.schema';
import { AppEvents } from 'src/shared/enums/app-events.enum';

export interface UserPresence {
  userId: string;
  isOnline: boolean;
  lastSeenAt: Date | null;
}

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  // userId -> Set<socketId>
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  getConnectionCount(userId: string): number {
    return this.userSockets.get(userId)?.size ?? 0;
  }

  isOnline(userId: string): boolean {
    return this.getConnectionCount(userId) > 0;
  }

  async markOnline(userId: string, socketId: string): Promise<{ becameOnline: boolean }> {
    const normalizedUserId = userId?.trim();
    if (!normalizedUserId) return { becameOnline: false };

    const sockets = this.userSockets.get(normalizedUserId) ?? new Set<string>();
    const wasOnline = sockets.size > 0;
    sockets.add(socketId);
    this.userSockets.set(normalizedUserId, sockets);

    if (!wasOnline) {
      try {
        await this.userModel
          .updateOne(
            { _id: normalizedUserId },
            { $set: { isOnline: true } },
          )
          .exec();
      } catch (e) {
        this.logger.warn(`Failed to persist isOnline=true for user ${normalizedUserId}: ${e?.message ?? e}`);
      }

      this.eventEmitter.emit(AppEvents.PRESENCE_ONLINE, {
        userId: normalizedUserId,
      });
      return { becameOnline: true };
    }

    return { becameOnline: false };
  }

  async markOffline(userId: string, socketId: string): Promise<{ becameOffline: boolean; lastSeenAt?: Date }> {
    const normalizedUserId = userId?.trim();
    if (!normalizedUserId) return { becameOffline: false };

    const sockets = this.userSockets.get(normalizedUserId);
    if (!sockets) return { becameOffline: false };

    sockets.delete(socketId);

    if (sockets.size > 0) {
      this.userSockets.set(normalizedUserId, sockets);
      return { becameOffline: false };
    }

    this.userSockets.delete(normalizedUserId);

    const lastSeenAt = new Date();
    try {
      await this.userModel
        .updateOne(
          { _id: normalizedUserId },
          { $set: { isOnline: false, lastSeenAt } },
        )
        .exec();
    } catch (e) {
      this.logger.warn(`Failed to persist offline for user ${normalizedUserId}: ${e?.message ?? e}`);
    }

    this.eventEmitter.emit(AppEvents.PRESENCE_OFFLINE, {
      userId: normalizedUserId,
      lastSeenAt,
    });

    return { becameOffline: true, lastSeenAt };
  }

  async getPresence(userIds: string[]): Promise<UserPresence[]> {
    const normalized = (userIds ?? [])
      .map((id) => id?.toString()?.trim())
      .filter((id): id is string => !!id);

    if (normalized.length === 0) return [];

    const docs = await this.userModel
      .find({ _id: { $in: normalized } })
      .select('_id isOnline lastSeenAt')
      .lean()
      .exec();

    const byId = new Map<string, { isOnline?: boolean; lastSeenAt?: Date }>();
    for (const d of docs as any[]) {
      byId.set(d._id.toString(), { isOnline: d.isOnline, lastSeenAt: d.lastSeenAt });
    }

    return normalized.map((userId) => {
      const db = byId.get(userId);
      const runtimeOnline = this.isOnline(userId);
      return {
        userId,
        isOnline: runtimeOnline || !!db?.isOnline,
        lastSeenAt: (db?.lastSeenAt as any) ?? null,
      };
    });
  }
}

