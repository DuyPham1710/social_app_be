import { Test, TestingModule } from '@nestjs/testing';
import { ReactCommentService } from './react-comment.service';

describe('ReactCommentService', () => {
  let service: ReactCommentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReactCommentService],
    }).compile();

    service = module.get<ReactCommentService>(ReactCommentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
