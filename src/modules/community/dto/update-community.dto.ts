import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CommunityPrivacy } from '../schemas/community.schema';
import { File } from 'multer';

export class UpdateCommunityDto {
    @ApiPropertyOptional({ description: 'Tên cộng đồng' })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({ description: 'Mô tả cộng đồng' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({
        type: 'string',
        format: 'binary',
        description: 'Avatar image',
        required: false
    })
    @IsOptional()
    avatar?: File;

    @ApiProperty({
        type: 'string',
        format: 'binary',
        description: 'Cover image (Ảnh bìa)',
        required: false
    })
    @IsOptional()
    coverImage?: File;


    @ApiPropertyOptional({
        description: 'Kiểu cộng đồng: public | private',
        enum: CommunityPrivacy,
    })
    @IsEnum(CommunityPrivacy)
    @IsOptional()
    privacy?: CommunityPrivacy;
}
