import { Test, TestingModule } from '@nestjs/testing';
import { ReactCommentController } from './react-comment.controller';
import { ReactCommentService } from './react-comment.service';

describe('ReactCommentController', () => {
  let controller: ReactCommentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReactCommentController],
      providers: [ReactCommentService],
    }).compile();

    controller = module.get<ReactCommentController>(ReactCommentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
