import { Expose, Type } from 'class-transformer';

class UserBasicDto {
    @Expose()
    _id: string;

    @Expose()
    username: string;

    @Expose()
    fullName: string;

    @Expose()
    avatarUrl: string;
}

class LastMessageDto {
    @Expose()
    messageId: string;

    @Expose()
    text: string;

    @Expose()
    @Type(() => UserBasicDto)
    sender: UserBasicDto;

    @Expose()
    createdAt: Date;
}

export class ConversationResponseDto {
    @Expose()
    _id: string;

    @Expose()
    @Type(() => UserBasicDto)
    participants: UserBasicDto[];

    @Expose()
    isGroup: boolean;

    @Expose()
    name?: string;

    @Expose()
    avatar?: string;

    @Expose()
    @Type(() => UserBasicDto)
    createdBy?: UserBasicDto;

    @Expose()
    @Type(() => LastMessageDto)
    lastMessage?: LastMessageDto;

    @Expose()
    createdAt: Date;

    @Expose()
    updatedAt: Date;

    @Expose()
    unreadCount?: number;
}

