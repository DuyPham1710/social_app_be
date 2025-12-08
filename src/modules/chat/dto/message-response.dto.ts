import { Expose, Type } from 'class-transformer';
import { EmojiResponseDto } from 'src/modules/emoji/dto/emoji_response.dto';
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
    emoji: EmojiResponseDto;
}

class SeenByDto {
    @Expose()
    @Type(() => UserResponseDto)
    user: UserResponseDto;

    @Expose()
    seenAt: Date;
}

export class ParentMessageDto {
    @Expose()
    _id: string;

    @Expose()
    text: string;

    @Expose()
    @Type(() => UserResponseDto)
    senderId: UserResponseDto;

    @Expose()
    createdAt: Date;

    @Expose()
    updatedAt: Date;
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
    @Type(() => ParentMessageDto)
    replyTo?: ParentMessageDto;

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
    isEdited: boolean;

    @Expose()
    createdAt: Date;

    @Expose()
    updatedAt: Date;
}

