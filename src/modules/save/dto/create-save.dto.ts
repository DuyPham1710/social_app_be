import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';

export class CreateSaveDto {
  @ApiProperty({ description: 'ID của đối tượng cần lưu (post, reel, comment)' })
  @IsMongoId()
  targetId: string;

  @ApiProperty({ description: 'Loại đối tượng', enum: ['post', 'reel', 'comment'] })
  @IsEnum(['post', 'reel', 'comment'])
  type: string;

  @ApiProperty({ description: 'Nội dung preview (hình ảnh, video, text)', required: false })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ description: 'Tên bộ sưu tập', required: false, default: 'default' })
  @IsOptional()
  @IsString()
  collection?: string;

  @ApiProperty({ description: 'Ghi chú thêm', required: false })
  @IsOptional()
  @IsString()
  note?: string;
}
