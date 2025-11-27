import { Expose, Type } from 'class-transformer';
import UserResponseDto from 'src/modules/user/dto/user.response.dto';

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
    @Type(() => UserResponseDto)
    user: UserResponseDto;

    @Expose()
    reaction: string;
}

class SeenByDto {
    @Expose()
    @Type(() => UserResponseDto)
    user: UserResponseDto;

    @Expose()
    seenAt: Date;
}

export class MessageResponseDto {
    @Expose()
    _id: string;

    @Expose()
    conversationId: string;

    @Expose()
    @Type(() => UserResponseDto)
    senderId: UserResponseDto;

    @Expose()
    text?: string;

    @Expose()
    @Type(() => AttachmentDto)
    attachments: AttachmentDto[];

    @Expose()
    replyTo?: MessageResponseDto; // có thể expand thành MessageResponseDto nếu cần

    @Expose()
    @Type(() => ReactionDto)
    reactions: ReactionDto[];

    @Expose()
    @Type(() => SeenByDto)
    seenBy: SeenByDto[];

    @Expose()
    deletedForEveryone: boolean;

    @Expose()
    @Type(() => UserResponseDto)
    deletedFor: UserResponseDto[];

    @Expose()
    createdAt: Date;

    @Expose()
    updatedAt: Date;
}

