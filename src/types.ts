export type SkillLevel = "Beginner" | "Intermediate" | "Advanced" | "All Levels";

export type GameType = "Indoor" | "Beach" | "Grass";

export interface Player {
  id: string;
  name: string;
}

export interface Game {
  id: string;
  title: string;
  type: GameType;
  skill: SkillLevel;
  /** ISO date string, e.g. 2026-06-20 */
  date: string;
  /** 24h time string, e.g. "18:30" */
  time: string;
  location: string;
  /** Free-text area/neighborhood used for search, e.g. "Santa Monica" */
  area: string;
  totalSlots: number;
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
  email?: string;
}

/** The authenticated user returned by the API (same shape as Profile). */
export type User = Profile;

export interface UserProfile {
  id: string;
  name: string;
  skill: SkillLevel;
  homeArea: string;
  memberSince: string;
  gamesHosted: number;
  gamesPlayed: number;
  hostedUpcoming: Game[];
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

export interface NewGameInput {
  title: string;
  type: GameType;
  skill: SkillLevel;
  date: string;
  time: string;
  location: string;
  area: string;
  totalSlots: number;
  notes: string;
}
