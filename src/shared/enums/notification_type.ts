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
  FACE_DETECTED = 'FACE_DETECTED',               // Mặt bạn được phát hiện trong ảnh của ai đó
  FACE_TAG_SUGGEST = 'FACE_TAG_SUGGEST',           // Gợi ý gắn thẻ từ face recognition
  TAG_POST = 'TAG_POST',                         // Ai đó gắn thẻ bạn trong bài viết

  // Community
  COMMUNITY_JOIN_REQUEST = 'COMMUNITY_JOIN_REQUEST',   // Ai đó gửi yêu cầu vào cộng đồng
  COMMUNITY_INVITE = 'COMMUNITY_INVITE',               // Được mời vào cộng đồng
  COMMUNITY_JOIN_APPROVED = 'COMMUNITY_JOIN_APPROVED', // Yêu cầu tham gia được duyệt
  COMMUNITY_JOIN_REJECTED = 'COMMUNITY_JOIN_REJECTED', // Yêu cầu tham gia bị từ chối
  COMMUNITY_POST_APPROVED = 'COMMUNITY_POST_APPROVED', // Bài viết cộng đồng được duyệt
  COMMUNITY_POST_REJECTED = 'COMMUNITY_POST_REJECTED', // Bài viết cộng đồng bị từ chối
  COMMUNITY_POST_PENDING = 'COMMUNITY_POST_PENDING',
  COMMUNITY_PUBLIC_JOIN = "COMMUNITY_PUBLIC_JOIN", // Có người tham gia cộng đồng công khai
}
