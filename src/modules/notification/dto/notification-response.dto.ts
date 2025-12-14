import { NotificationType } from "src/shared/enums/notification_type";

export interface NotificationResponse {
  _id: string;
  receiver: string;
  sender?: {
    _id: string;
    username: string;
    fullName: string;
    avatarUrl?: string;
  } | null;
  type: NotificationType;
  targetId?: string;
  message: string;
  isRead: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
