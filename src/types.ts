// New grading scale (2026-07): All Levels + four grades. The legacy values
// remain in the union so games/profiles created before the change still type.
export type SkillLevel =
  | "All Levels"
  | "Low Beginner"
  | "High Beginner"
  | "Low Intermediate"
  | "High Intermediate"
  | "Beginner"
  | "Intermediate"
  | "Advanced";

export type GameType = "Indoor" | "Beach" | "Grass";

export type GameGender = "Men" | "Women" | "Mixed" | "Open";

export interface Player {
  id: string;
  name: string;
  /** Whether this member has paid their share of the court cost. */
  paid?: boolean;
}

export interface Game {
  id: string;
  title: string;
  type: GameType;
  skill: SkillLevel;
  gender: GameGender;
  netHeight: string;
  positionsNeeded: string[];
  rotationType: string;
  /** Cost each player pays, in dollars (0 = free / not set). */
  costPerPerson: number;
  /** Broad area of the island: North | South | East | West (or "" if unset). */
  region: string;
  /** ISO date string, e.g. 2026-06-20 */
  date: string;
  /** 24h time string, e.g. "18:30" */
  time: string;
  endTime: string;
  location: string;
  /** Free-text area/neighborhood used for search, e.g. "Tampines" */
  area: string;
  totalSlots: number;
  /** Pre-filled spots from friends the host is already bringing (not registered users). */
  preFilled: number;
  hostId: string;
  hostName: string;
  notes: string;
  /** Players who have a confirmed spot (includes the host). */
  players: Player[];
  /** Players waiting if the game is full. */
  waitlist: Player[];
  /** User ids who tapped "interested". */
  interestedIds: string[];
  /** Links weekly occurrences created together; null for one-off games. */
  seriesId?: string | null;
  createdAt: string;
}

export interface Profile {
  id: string;
  name: string;
  skill: SkillLevel;
  homeArea: string;
  bio: string;
  avatarUrl: string;
  email?: string;
  role?: "user" | "staff" | "admin";
  birthdate?: string | null;
  userGender?: string;
  showAge?: boolean;
  showGender?: boolean;
  favoritePositions?: string[];
  playerRating?: { count: number; avg: number | null };
  bannerColor?: string;
  bannerImage?: string;
}

export interface AdminStats {
  users: number;
  newUsers7d: number;
  newUsers30d: number;
  suspendedUsers: number;
  games: number;
  upcomingGames: number;
  highlights: number;
  comments: number;
  signupsByWeek: { week: string; count: number }[];
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "user" | "staff" | "admin";
  skill: SkillLevel;
  createdAt: string;
  suspended: boolean;
  hosted: number;
  joined: number;
}

export interface AdminComment {
  id: string;
  kind: "game" | "highlight";
  body: string;
  author: string;
  refId: string;
  refTitle: string;
  createdAt: string;
}

export interface AdminFeedback {
  id: string;
  type: "feedback" | "bug" | "other";
  subject: string;
  body: string;
  resolved: boolean;
  userName: string;
  userEmail: string;
  createdAt: string;
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  detail: string;
  adminName: string;
  adminEmail: string;
  createdAt: string;
}

export type ReportTargetType =
  | "game"
  | "highlight"
  | "game_comment"
  | "highlight_comment";

export interface AdminReport {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  reporterName: string;
  createdAt: string;
}

export interface AppConfig {
  maintenanceMode: boolean;
  signupsEnabled: boolean;
}

/** The authenticated user returned by the API (same shape as Profile). */
export type User = Profile;

export interface UserProfile {
  id: string;
  name: string;
  skill: SkillLevel;
  homeArea: string;
  bio: string;
  avatarUrl: string;
  memberSince: string;
  gamesHosted: number;
  gamesPlayed: number;
  hostedUpcoming: Game[];
  ageDisplay?: string;
  genderDisplay?: string;
  favoritePositions?: string[];
  playerRating?: { count: number; avg: number | null };
  bannerColor?: string;
  bannerImage?: string;
  /** Whether the viewing user has blocked this profile's user. */
  blocked?: boolean;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
}

/** A single message in a game's members-only chat. */
export interface Message {
  id: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
}

/** A row in the Chats hub — one game chat the user belongs to. */
export interface ChatSummary {
  gameId: string;
  title: string;
  date: string;
  time: string;
  hostId: string;
  memberCount: number;
  lastMessage: string | null;
  lastSender: string | null;
  lastMessageAt: string | null;
}

export interface AppNotification {
  id: string;
  type: string;
  message: string;
  gameId: string | null;
  read: boolean;
  createdAt: string;
}

export interface Highlight {
  id: string;
  userId: string;
  userName: string;
  caption: string;
  videoUrl: string;
  thumbUrl: string;
  mediaType: "video" | "photo";
  createdAt: string;
  likesCount: number;
  likedBy: string[];
  commentsCount: number;
}

/** A comment on a highlight — anyone can post. */
export interface HighlightComment {
  id: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
}

export interface NewGameInput {
  title: string;
  type: GameType;
  skill: SkillLevel;
  gender: GameGender;
  netHeight: string;
  positionsNeeded: string[];
  rotationType: string;
  costPerPerson: number;
  region: string;
  date: string;
  time: string;
  endTime: string;
  location: string;
  area: string;
  totalSlots: number;
  preFilled: number;
  notes: string;
}

export interface Review {
  id: string;
  reviewerId: string;
  reviewerName: string;
  hostId: string;
  rating: number;
  comment: string;
  createdAt: string;
}
