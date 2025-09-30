import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchFriendsDto {
  @ApiProperty({ 
    description: 'Từ khóa tìm kiếm (tên, username)', 
    required: false,
    example: 'John Doe'
  })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiProperty({ 
    description: 'Số trang (bắt đầu từ 1)', 
    required: false, 
    default: 1,
    minimum: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ 
    description: 'Số lượng kết quả trên mỗi trang', 
    required: false, 
    default: 10,
    minimum: 1,
    maximum: 50
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
