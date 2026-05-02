// dto/create-notification.dto.ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { NotificationType } from 'src/shared/enums/notification_type';

export class CreateNotificationDto {
  @IsNotEmpty()
  receiver: string; // userId

  @IsOptional()
  sender?: string;

  @IsOptional()
  type?: NotificationType;

  @IsOptional()
  targetId?: string;

  @IsOptional()
  communityId?: string;

  @IsNotEmpty()
  @IsString()
  message: string;

  @IsString()
  content?: string;

}


