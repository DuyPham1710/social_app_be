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

class AttachmentDto {
    @Expose()
    url: string;

    @Expose()
    type: string;

    @Expose()
    size: number;
}

class ReactionDto {
    @Expose()
    userId: string;

    @Expose()
    reaction: string;
}

class SeenByDto {
    @Expose()
    @Type(() => UserBasicDto)
    user: UserBasicDto;

    @Expose()
    seenAt: Date;
}

export class MessageResponseDto {
    @Expose()
    _id: string;

    @Expose()
    conversationId: string;

    @Expose()
    @Type(() => UserBasicDto)
    sender: UserBasicDto;

    @Expose()
    text?: string;

    @Expose()
    @Type(() => AttachmentDto)
    attachments: AttachmentDto[];

    @Expose()
    replyTo?: any; // có thể expand thành MessageResponseDto nếu cần

    @Expose()
    @Type(() => ReactionDto)
    reactions: ReactionDto[];

    @Expose()
    @Type(() => SeenByDto)
    seenBy: SeenByDto[];

    @Expose()
    deletedForEveryone: boolean;

    @Expose()
    createdAt: Date;

    @Expose()
    updatedAt: Date;
}

