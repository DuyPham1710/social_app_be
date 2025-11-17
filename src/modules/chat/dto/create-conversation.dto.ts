import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateConversationDto {
    @IsArray()
    @IsNotEmpty()
    participantIds: string[];

    @IsBoolean()
    @IsOptional()
    isGroup?: boolean;

    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    avatar?: string;
}

