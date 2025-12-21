import { Expose, Type } from 'class-transformer';
import UserResponseDto from 'src/modules/user/dto/user.response.dto';
import { AttachmentDto } from './message-response.dto';

class LastMessageDto {
    @Expose()
    @Type(() => String)
    _id: string;

    @Expose()
    text: string;

    @Expose()
    @Type(() => AttachmentDto)
    attachments: AttachmentDto[];

    @Expose()
    @Type(() => UserResponseDto)
    senderId: UserResponseDto;

    @Expose()
    createdAt: Date;
}

export class ConversationResponseDto {
    @Expose()
    @Type(() => String)
    _id: string;

    @Expose()
    @Type(() => UserResponseDto)
    participants: UserResponseDto[];

    @Expose()
    isGroup: boolean;

    @Expose()
    name?: string;

    @Expose()
    avatar?: string;

    @Expose()
    @Type(() => UserResponseDto)
    createdBy?: UserResponseDto;

    @Expose()
    @Type(() => LastMessageDto)
    lastMessageId?: LastMessageDto;

    @Expose()
    createdAt: Date;

    @Expose()
    updatedAt: Date;

    @Expose()
    unreadCount?: number;

    @Expose()
    firstUnreadMessageIndex?: number; // Index của tin nhắn chưa đọc đầu tiên trong list
}

