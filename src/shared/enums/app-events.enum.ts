export enum AppEvents {
    // ===== USER =====
    USER_REGISTERED = 'user.registered',
    USER_REGISTER_FAILED = 'user.register.failed',
    USER_FIND_BY_EMAIL = 'user.findByEmail',
    USER_FIND_BY_USERNAME = 'user.findByUsername',
    USER_FIND_ONE = 'user.findOne',
    USER_CREATE = 'user.create',
    USER_CREATED = 'user.created',
    USER_UPDATE = 'user.update',
    USER_UPDATE_REFRESH_TOKEN = 'user.updateRefreshToken',
    USER_VALIDATE_BY_EMAIL = 'user.validateByEmail',
    USER_CHECK_EXISTS = 'user.checkExists',
    USER_GET_BASIC_INFO = 'user.getBasicInfo',

    // ===== MAIL =====
    MAIL_SEND = 'mail.send',

    // ===== ACCOUNT =====
    ACCOUNT_CREATE = 'account.createAccount',

    // ===== FRIENDS =====
    FRIENDS_GET = 'friends.get',
    USER_AGGREGATE = 'user.aggregate',

    // ===== POST =====
    POST_CREATED = 'post.created',
    POST_DELETED = 'post.deleted',
    POST_GET_USER_ID = 'post.getUserId',
    POST_GET_ALL_BY_USER = 'post.getAllByUser',
    POST_GET_DETAIL = 'post.getDetail',

    // ===== REACT POST =====
    REACT_POST_GET = 'react-post.get',
    REACT_POST_FIND_BY_USER = 'react-post.findByUser',
    REACT_POST_FIND_BY_POST = 'react-post.findByPost',

    // ===== STORY =====
    STORY_CREATED = 'story.created',
    STORY_EXPIRED = 'story.expired',
    STORY_GET_USER_ID = 'story.getUserId',
    STORY_GET = 'story.get',

    // ===== REACT COMMENT =====


    // ===== REACT STORY =====
    REACT_STORY_GET = 'react-story.get',
    REACT_STORY_FIND_BY_USER = 'react-story.findByUser',
    REACT_STORY_FIND_BY_STORY = 'react-story.findByStory',

    // ===== CHAT =====
    CHAT_SEND_MESSAGE = 'chat.sendMessage',
    REACT_COMMENT_GET = "REACT_COMMENT_GET",
    REACT_COMMENT_FIND_BY_USER = "REACT_COMMENT_FIND_BY_USER",

    //===== COMMENT =====
    COMMENT_GET_USER_ID = 'comment.getUserId',
    USER_GET_FCM_TOKEN = "USER_GET_FCM_TOKEN",
    COMMENT_FIND_BY_POST_ID = 'comment.findByPostId',

    // ===== ADMIN =====
    // Admin User
    ADMIN_USER_GET_ALL = 'admin.user.getAll',
    ADMIN_USER_GET_BY_ID = 'admin.user.getById',
    ADMIN_USER_CREATE = 'admin.user.create',
    ADMIN_USER_UPDATE = 'admin.user.update',
    ADMIN_USER_DELETE = 'admin.user.delete',
    ADMIN_USER_GET_ACTIVITY = 'admin.user.getActivity',
    ADMIN_USERS_GROWTH = 'admin.users.growth',
    
    // Admin Post
    ADMIN_POST_GET_ALL = 'admin.post.getAll',
    ADMIN_POST_DELETE = 'admin.post.delete',
    ADMIN_POST_HIDE = 'admin.post.hide',
    ADMIN_POST_UNHIDE = 'admin.post.unhide',
    ADMIN_POSTS_STATS = 'admin.posts.stats',
    
    // Admin Story
    ADMIN_STORY_GET_ALL = 'admin.story.getAll',
    ADMIN_STORY_DELETE = 'admin.story.delete',
    
    // Admin Comment
    ADMIN_COMMENT_GET_ALL = 'admin.comment.getAll',
    ADMIN_COMMENT_GET_BY_ID = 'admin.comment.getById',
    ADMIN_COMMENT_DELETE = 'admin.comment.delete',
    ADMIN_COMMENT_FIND_BY_USER = 'admin.comment.findByUser',
    
    // Admin Post Report
    ADMIN_POST_REPORT_GET_ALL = 'admin.postReport.getAll',
    ADMIN_POST_REPORT_GET_BY_ID = 'admin.postReport.getById',
    ADMIN_POST_REPORT_UPDATE_STATUS = 'admin.postReport.updateStatus',
    ADMIN_POST_REPORT_BULK_UPDATE_STATUS = 'admin.postReport.bulkUpdateStatus',
    
    // Admin Dashboard
    ADMIN_DASHBOARD_STATS = 'admin.dashboard.stats',
    
    // Admin React
    ADMIN_REACT_POST_FIND_BY_USER = 'admin.reactPost.findByUser',
    ADMIN_REACT_STORY_FIND_BY_USER = 'admin.reactStory.findByUser',
    COMMENT_GET_POST_ID = "COMMENT_GET_POST_ID",
    POST_CAN_VIEW = "POST_CAN_VIEW",
    USER_IS_ADMIN = "USER_IS_ADMIN",
    GET_ADMIN_ID = "GET_ADMIN_ID",
}
