import { Types } from 'mongoose';
import { PostResponseDto } from 'src/modules/post/dto/post-response.dto';
import UserResponseDto from 'src/modules/user/dto/user.response.dto';

export class PostReportResponseDto {
  _id: Types.ObjectId;
  postId: Types.ObjectId | PostResponseDto;
  userId: Types.ObjectId | UserResponseDto;
  reason: string;
  description?: string;
  status: 'pending' | 'reviewed' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}



