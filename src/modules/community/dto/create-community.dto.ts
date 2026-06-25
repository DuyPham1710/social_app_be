import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CommunityPrivacy } from '../schemas/community.schema';
import { CommunityType } from 'src/shared/enums/community_type';
import { File } from 'multer';

export class CreateCommunityDto {
    @ApiPropertyOptional({ description: 'Tên cộng đồng' })
    @IsString()
    @IsOptional()
    @IsNotEmpty()
    name: string;

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
    avatar?: File[];

    @ApiProperty({
        type: 'string',
        format: 'binary',
        description: 'Cover image (Ảnh bìa)',
        required: false
    })
    @IsOptional()
    coverImage?: File[];

    @ApiProperty({
        description: 'Kiểu cộng đồng: public | private',
        enum: CommunityPrivacy,
        default: CommunityPrivacy.PUBLIC,
    })
    @IsEnum(CommunityPrivacy)
    @IsOptional()
    privacy?: CommunityPrivacy;

    @ApiProperty({
        description: 'Loại cộng đồng: standard | travel',
        enum: CommunityType,
        default: CommunityType.STANDARD,
    })
    @IsEnum(CommunityType)
    @IsOptional()
    type?: CommunityType;
}
