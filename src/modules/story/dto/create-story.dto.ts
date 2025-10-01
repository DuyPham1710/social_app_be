import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
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
    @IsEnum(['image', 'video', 'text'])
    @ApiProperty({ example: 'image', required: false })
    mediaType?: string;

    @IsOptional()
    @ApiProperty({ example: { id: 1, title: 'This is a story music', preview: 'https://example.com/music.mp3', artist: { id: 1, name: 'John Doe', picture: 'https://example.com/artist.jpg' }, album: { id: 1, title: 'This is a story album', cover: 'https://example.com/album.jpg' } }, required: false })
    music?: DeezerMusic;

    @IsOptional()
    @IsEnum(PrivacyType)
    @ApiProperty({ example: PrivacyType.PUBLIC, required: false })
    privacy_type?: PrivacyType;

    @IsOptional()
    @ApiProperty({ example: ['1', '2', '3'], required: false })
    friends_except?: string[];

    @IsOptional()
    @ApiProperty({ example: ['1', '2', '3'], required: false })
    friends_detail?: string[];
}
