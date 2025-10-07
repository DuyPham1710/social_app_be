import { Injectable } from '@nestjs/common';
import { CreateReactCommentDto } from './dto/create-react-comment.dto';
import { UpdateReactCommentDto } from './dto/update-react-comment.dto';

@Injectable()
export class ReactCommentService {
  create(createReactCommentDto: CreateReactCommentDto) {
    return 'This action adds a new reactComment';
  }

  findAll() {
    return `This action returns all reactComment`;
  }

  findOne(id: number) {
    return `This action returns a #${id} reactComment`;
  }

  update(id: number, updateReactCommentDto: UpdateReactCommentDto) {
    return `This action updates a #${id} reactComment`;
  }

  remove(id: number) {
    return `This action removes a #${id} reactComment`;
  }
}
