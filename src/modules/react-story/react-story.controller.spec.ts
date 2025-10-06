import { Test, TestingModule } from '@nestjs/testing';
import { ReactStoryController } from './react-story.controller';
import { ReactStoryService } from './react-story.service';

describe('ReactStoryController', () => {
  let controller: ReactStoryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReactStoryController],
      providers: [ReactStoryService],
    }).compile();

    controller = module.get<ReactStoryController>(ReactStoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
