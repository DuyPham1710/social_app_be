import { Expose, Type } from 'class-transformer';
import { EmojiResponseDto } from 'src/modules/emoji/dto/emoji_response.dto';
import UserResponseDto from 'src/modules/user/dto/user.response.dto';

export class AttachmentDto {
    @Expose()
    url: string;

    @Expose()
    type: string;

    @Expose()
    size: number;

    @Expose()
    name?: string;

    @Expose()
    duration?: number;

    @Expose()
    waveform?: number[];
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
    @Type(() => AttachmentDto)
    attachments: AttachmentDto[];

    @Expose()
    @Type(() => UserResponseDto)
    senderId: UserResponseDto;

    @Expose()
    createdAt: Date;

    @Expose()
    updatedAt: Date;
}

class MessageMetadataDto {
    @Expose()
    type?: string; // 'video_call' | 'audio_call' | 'location'

    @Expose()
    callStatus?: string; // 'completed' | 'missed' | 'rejected'

    @Expose()
    duration?: number; // in seconds

    @Expose()
    callId?: string;

    // Location message metadata
    @Expose()
    latitude?: number;

    @Expose()
    longitude?: number;

    @Expose()
    mapUrl?: string;

    @Expose()
    label?: string;
}

export class StoryReplyDto {
    @Expose()
    _id: string;

    @Expose()
    title?: string;

    @Expose()
    mediaUrl?: string;

    @Expose()
    mediaType: string;

    @Expose()
    @Type(() => UserResponseDto)
    userId: UserResponseDto;

    @Expose()
    createdAt: Date;
}

export class PostUrlDto {
    @Expose()
    _id: string;

    @Expose()
    url: string;

    @Expose()
    title?: string;

    @Expose()
    order: number;
}

export class PostShareDto {
    @Expose()
    _id: string;

    @Expose()
    caption?: string;

    @Expose()
    @Type(() => PostUrlDto)
    urls: PostUrlDto[];

    @Expose()
    layout: string;

    @Expose()
    @Type(() => UserResponseDto)
    userId: UserResponseDto;

    @Expose()
    createdAt: Date;
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
    @Type(() => StoryReplyDto)
    story?: StoryReplyDto;

    @Expose()
    @Type(() => PostShareDto)
    post?: PostShareDto;

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
    @Type(() => MessageMetadataDto)
    metadata?: MessageMetadataDto;

    @Expose()
    createdAt: Date;

    @Expose()
    updatedAt: Date;
}

