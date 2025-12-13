import { IsArray, IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';

export enum CallType {
    VIDEO = 'video',
    AUDIO = 'audio',
}

export class CreateCallDto {
    @IsString()
    @IsNotEmpty()
    receiverId: string;

    @IsEnum(CallType)
    @IsNotEmpty()
    callType: CallType;

    @IsString()
    @IsOptional()
    conversationId?: string;
}

export class CreateGroupCallDto {
    @IsArray()
    @IsNotEmpty()
    participantIds: string[];

    @IsEnum(CallType)
    @IsNotEmpty()
    callType: CallType;

    @IsString()
    @IsOptional()
    conversationId?: string;
}

