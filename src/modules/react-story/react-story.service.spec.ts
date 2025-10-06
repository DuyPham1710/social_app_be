import { Test, TestingModule } from '@nestjs/testing';
import { ReactStoryService } from './react-story.service';

describe('ReactStoryService', () => {
  let service: ReactStoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReactStoryService],
    }).compile();

    service = module.get<ReactStoryService>(ReactStoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
