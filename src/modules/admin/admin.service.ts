import { Injectable } from '@nestjs/common';
import { PostService } from '../post/post.service';
import { StoryService } from '../story/story.service';
import { ReactPostService } from '../react-post/react-post.service';
import { ReactStoryService } from '../react-story/react-story.service';
import { CommentService } from '../comment/comment.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly postService: PostService,
    private readonly storyService: StoryService,
    private readonly reactPostService: ReactPostService,
    private readonly reactStoryService: ReactStoryService,
    private readonly commentService: CommentService,
  ) {}

  getUserPosts(userId: string, page: number = 1, limit: number = 10) {
    // Sử dụng ownerId làm viewerId để bỏ qua kiểm tra quyền riêng tư
    return this.postService.getAllPostsByUser(userId, userId, page, limit);
  }

  getUserStories(userId: string) {
    return this.storyService.getStories(userId, userId);
  }

  getPostReacts(postId: string) {
    return this.reactPostService.findByPost(postId);
  }

  getPostComments(postId: string) {
    return this.commentService.findByPostId(postId);
  }

  getStoryReacts(storyId: string) {
    return this.reactStoryService.findByStory(storyId);
  }
}
