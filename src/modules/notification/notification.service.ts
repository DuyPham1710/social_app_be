import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification } from './schemas/notification.schema';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async create(data: {
    receiver: string;
    sender?: string;
    type: string;
    message: string;
    targetId?: string;
  }) {
    const created: any = await this.notificationModel.create({
      ...data,
      receiver: new Types.ObjectId(data.receiver),
      sender: data.sender ? new Types.ObjectId(data.sender) : null,
      targetId: data.targetId ? new Types.ObjectId(data.targetId) : null,
    });


    // Emit realtime
    this.notificationGateway.pushNotification(data.receiver, {
      id: created._id,
      type: created.type,
      message: created.message,
      sender: created.sender,
      receiver: created.receiver,
      targetId: created.targetId,
      createdAt: created.createdAt,
    });

    return created;
  }

  async getUserNotifications(userId: string) {
    return this.notificationModel
      .find({ receiver: userId })
      .sort({ createdAt: -1 })
      .populate('sender', 'fullName avatar');
  }

  async markAsRead(id: string) {
    return this.notificationModel.findByIdAndUpdate(
      id,
      { isRead: true },
      { new: true },
    );
  }
}
