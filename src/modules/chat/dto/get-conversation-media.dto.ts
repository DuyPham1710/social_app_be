import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AttachmentType } from 'src/shared/enums/Attachment_type';

export class GetConversationMediaDto {
    @IsOptional()
    @IsEnum(AttachmentType, { message: 'type must be one of: image, video, file, link' })
    type?: AttachmentType = AttachmentType.IMAGE;

    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    @Min(1)
    page?: number = 1;

    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    @Min(1)
    limit?: number = 30;
}
