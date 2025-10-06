import { 
  Body, 
  Controller, 
  Delete, 
  Param, 
  Post, 
  Get, 
  Patch, 
  Req,
  UseGuards 
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ReactPostService } from './react-post.service';
import { CreateReactPostDto } from './dto/create-react-post.dto';
import { UpdateReactPostDto } from './dto/update-react-post.dto';

@ApiBearerAuth()
@ApiTags('ReactPost')
@UseGuards(JwtAuthGuard)
@Controller('react-post')
export class ReactPostController {
  constructor(private readonly reactPostService: ReactPostService) {}

  
  @Post()
  createOrUpdate(@Req() req, @Body() dto: CreateReactPostDto) {
    const userId = req.user.userId;
    return this.reactPostService.createOrUpdate(userId, dto);
  }

  
  @Get(':postId')
  findByPost(@Param('postId') postId: string) {
    return this.reactPostService.findByPost(postId);
  }

  //kiểm tra user hiện tại có react bài post không
  @Get('user/current/:postId')
  checkUserReact(@Req() req, @Param('postId') postId: string) {
    const userId = req.user.userId;
    return this.reactPostService.findUserReactOnPost(userId, postId);
  }

  //update emoji
  @Patch(':postId')
  update(@Req() req, @Param('postId') postId: string, @Body() dto: UpdateReactPostDto) {
    const userId = req.user.userId;
    return this.reactPostService.update(userId, postId, dto);
  }

  //xóa react
  @Delete(':postId')
  remove(@Req() req, @Param('postId') postId: string) {
    const userId = req.user.userId;
    return this.reactPostService.remove(userId, postId);
  }
}
