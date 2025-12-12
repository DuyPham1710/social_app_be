import { IsNotEmpty } from 'class-validator';

export class MarkReadDto {
  @IsNotEmpty()
  notificationId: string;
}