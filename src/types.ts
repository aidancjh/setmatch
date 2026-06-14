export type SkillLevel = "Beginner" | "Intermediate" | "Advanced" | "All Levels";

export type GameType = "Indoor" | "Beach" | "Grass";

export type GameGender = "Men" | "Women" | "Mixed" | "Open";

export interface Player {
  id: string;
  name: string;
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
  courtFee: string;
  /** ISO date string, e.g. 2026-06-20 */
  date: string;
  /** 24h time string, e.g. "18:30" */
  time: string;
  endTime: string;
  location: string;
  /** Free-text area/neighborhood used for search, e.g. "Santa Monica" */
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
}

export interface AdminStats {
  users: number;
  newUsers7d: number;
  games: number;
  upcomingGames: number;
  comments: number;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "user" | "staff" | "admin";
  skill: SkillLevel;
  createdAt: string;
  hosted: number;
  joined: number;
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
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
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
}

export interface NewGameInput {
  title: string;
  type: GameType;
  skill: SkillLevel;
  gender: GameGender;
  netHeight: string;
  positionsNeeded: string[];
  rotationType: string;
  courtFee: string;
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
