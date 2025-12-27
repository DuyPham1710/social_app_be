export enum NotificationType {
  FRIEND_REQUEST = 'FRIEND_REQUEST',        // Ai đó gửi lời mời kết bạn
  FRIEND_ACCEPT = 'FRIEND_ACCEPT',          // Ai đó chấp nhận lời mời kết bạn
  NEW_POST = 'NEW_POST',                    // Người bạn theo dõi đăng bài
  POST_REACTION = 'POST_REACTION',          // Ai đó react bài viết của bạn
  POST_COMMENT = 'POST_COMMENT',            // Ai đó bình luận bài bạn
  MENTION = 'MENTION',                       // Ai đó nhắc tới bạn
  STORY_REACTION = "STORY_REACTION",
  COMMENT_REACTION = "COMMENT_REACTION",
  POST_REPORT_REVIEWED = 'POST_REPORT_REVIEWED', // Admin đã xử lý báo cáo bài viết của bạn
}
