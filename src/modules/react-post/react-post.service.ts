import { Injectable } from '@nestjs/common';
import { CreateReactPostDto } from './dto/create-react-post.dto';
import { UpdateReactPostDto } from './dto/update-react-post.dto';

@Injectable()
export class ReactPostService {
  create(createReactPostDto: CreateReactPostDto) {
    return 'This action adds a new reactPost';
  }

  findAll() {
    return `This action returns all reactPost`;
  }

  findOne(id: number) {
    return `This action returns a #${id} reactPost`;
  }

  update(id: number, updateReactPostDto: UpdateReactPostDto) {
    return `This action updates a #${id} reactPost`;
  }

  remove(id: number) {
    return `This action removes a #${id} reactPost`;
  }
}
