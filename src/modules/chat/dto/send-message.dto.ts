import { IsArray, IsNotEmpty, IsOptional, IsString, IsNumber, Max, Min, ArrayMaxSize } from 'class-validator';

class AttachmentDto {
    @IsString()
    url: string;

    @IsString()
    type: string;

    @IsOptional()
    size?: number;

    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsNumber()
    @Max(60)
    @Min(0)
    duration?: number;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(40)
    waveform?: number[];
}

export class SendMessageDto {
    @IsString()
    @IsNotEmpty()
    conversationId: string;

    @IsString()
    @IsOptional()
    text?: string;

    @IsArray()
    @IsOptional()
    attachments?: AttachmentDto[]; // URLs từ Cloudinary sau khi upload

    @IsString()
    @IsOptional()
    replyTo?: string;

    @IsString()
    @IsOptional()
    storyId?: string;

    @IsOptional()
    metadata?: {
        type?: 'video_call' | 'audio_call';
        callStatus?: 'completed' | 'missed' | 'rejected';
        duration?: number;
        callId?: string;
    };
}

