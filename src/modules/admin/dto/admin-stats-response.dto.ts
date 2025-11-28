import { ApiProperty } from '@nestjs/swagger';

export class AdminStatsResponseDto {
  @ApiProperty({ description: 'Tổng số người dùng' })
  totalUsers: number;

  @ApiProperty({ description: 'Tổng số bài viết' })
  totalPosts: number;

  @ApiProperty({ description: 'Tổng số story' })
  totalStories: number;

  @ApiProperty({ description: 'Tổng số bình luận' })
  totalComments: number;

  @ApiProperty({ description: 'Người dùng mới trong tháng này' })
  newUsersThisMonth: number;

  @ApiProperty({ description: 'Bài viết mới trong tháng này' })
  newPostsThisMonth: number;

  @ApiProperty({ description: 'Hoạt động gần đây' })
  recentActivity?: any[];
}

export class UserGrowthDataDto {
  @ApiProperty({ description: 'Ngày' })
  date: string;

  @ApiProperty({ description: 'Số lượng người dùng mới' })
  count: number;

  @ApiProperty({ description: 'Tổng số người dùng' })
  total: number;
}

export class UserGrowthResponseDto {
  @ApiProperty({ type: [UserGrowthDataDto], description: 'Dữ liệu tăng trưởng người dùng' })
  data: UserGrowthDataDto[];

  @ApiProperty({ description: 'Tổng số người dùng hiện tại' })
  totalUsers: number;
}

export class PostStatsDataDto {
  @ApiProperty({ description: 'Ngày hoặc tháng' })
  date: string;

  @ApiProperty({ description: 'Số lượng bài viết' })
  count: number;
}

export class PostStatsResponseDto {
  @ApiProperty({ type: [PostStatsDataDto], description: 'Thống kê bài viết theo ngày/tháng' })
  data: PostStatsDataDto[];

  @ApiProperty({ description: 'Tổng số bài viết' })
  totalPosts: number;
}





