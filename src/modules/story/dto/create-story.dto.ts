import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { Transform } from 'class-transformer';
import { MediaType } from 'src/shared/enums/media_type';
import { PrivacyType } from 'src/shared/enums/privacy_type';
import { DeezerMusic } from 'src/shared/interfaces/deezer-music.interface';

export class CreateStoryDto {
    @IsOptional()
    @IsString()
    @ApiProperty({ example: 'This is a story title', required: false })
    title?: string;

    @IsOptional()
    @IsUrl()
    @ApiProperty({ example: 'https://example.com/image.jpg', required: false })
    mediaUrl?: string;

    @IsOptional()
    @IsEnum(MediaType)
    @ApiProperty({ example: MediaType.IMAGE, required: false })
    mediaType?: MediaType;

    @IsOptional()
    @Transform(({ value }) => {
        if (!value) return undefined;
        if (typeof value === 'object') return value; // Nếu đã là object thì giữ nguyên
        try {
            return JSON.parse(value); // Parse JSON string thành object
        } catch {
            return undefined;
        }
    })
    @ApiProperty({ example: { id: 1, title: 'This is a story music', preview: 'https://example.com/music.mp3', artist: { id: 1, name: 'John Doe', picture: 'https://example.com/artist.jpg' }, album: { id: 1, title: 'This is a story album', cover: 'https://example.com/album.jpg' } }, required: false })
    music?: DeezerMusic;

    @IsOptional()
    @IsEnum(PrivacyType)
    @ApiProperty({ example: PrivacyType.PUBLIC, required: false })
    privacy_type?: PrivacyType;

    @IsOptional()
    @Transform(({ value }) => {
        if (!value) return undefined;
        if (Array.isArray(value)) return value; // Nếu form-data tự tách rồi thì giữ nguyên
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            if (typeof value === 'string') {
                return value.split(',').map((v) => v.trim());
            }
        }
        return [String(value)];
    })
    @ApiProperty({ example: ['1', '2', '3'], required: false })
    friends_except?: string[];

    @IsOptional()
    @Transform(({ value }) => {
        if (!value) return undefined;
        if (Array.isArray(value)) return value; // Nếu form-data tự tách rồi thì giữ nguyên
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            if (typeof value === 'string') {
                return value.split(',').map((v) => v.trim());
            }
        }
        return [String(value)];
    })
    @ApiProperty({ example: ['1', '2', '3'], required: false })
    friends_detail?: string[];
}
