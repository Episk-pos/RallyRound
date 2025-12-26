export interface Topic {
  id: string;
  title: string;
  description: string;
  presenter: string;
  presenterEmail: string;
  presenterPub: string; // SEA public key
  minParticipants: number;
  maxParticipants?: number;
  duration: number;
  type: 'one-time' | 'recurring';
  recurrence?: 'weekly' | 'biweekly' | 'monthly';
  stage: 1 | 2 | 3;
  createdAt: number;
  scheduledTime?: number;
  // Scheduling configuration (set by owner)
  schedulingConfig?: SchedulingConfig;
}

export interface SchedulingConfig {
  schedulingWindowDays: number;        // How many days ahead to look for slots
  consensusThreshold: number;          // Percentage (0-100) of participants needed for auto-confirm
  lockAfterSelections: number;         // Stop adjusting suggestions after N users select
  slotGeneratedAt?: number;            // When slots were last generated
}

export interface TimeSlot {
  id: string;
  start: number;              // timestamp
  end: number;                // timestamp
  score: number;              // Percentage of participants available (0-100)
  invalidatedAt?: number;     // timestamp if slot became invalid due to calendar conflict
}

export interface SchedulingPreference {
  userPub: string;
  userName: string;
  userEmail: string;
  selectedSlots: string[];           // TimeSlot IDs user voted for
  availability: AvailabilityWindow[];
  calendarSyncedAt?: number;         // When Google Calendar was last synced
  timestamp: number;
}

export interface AvailabilityWindow {
  start: number;              // timestamp
  end: number;                // timestamp
  source: 'google' | 'manual';
}

export interface Notification {
  id: string;
  userPub: string;
  type: NotificationType;
  topicId: string;
  topicTitle: string;
  message: string;
  read: boolean;
  createdAt: number;
}

export type NotificationType =
  | 'slot_invalidated'      // User's selected slot has calendar conflict
  | 'consensus_reached'     // Threshold met, topic auto-scheduled
  | 'scheduled'            // Owner manually confirmed time
  | 'preference_needed'    // Topic entered Stage 2, please vote
  | 'availability_needed'; // Reminder to submit availability

export interface Interest {
  name: string;
  email: string;
  pub: string; // SEA public key
  timestamp: number;
}

export interface PublicTopicRef {
  id: string;
  title: string;
  presenter: string;
  presenterPub: string;
  minParticipants: number;
  stage: 1 | 2 | 3;
  interestCount: number;
  createdAt: number;
}

// =============================================================================
// LIVE SESSION TYPES
// =============================================================================

export type SessionStatus = 'scheduled' | 'active' | 'paused' | 'ended';
export type SessionMode = 'unstructured' | 'structured';

export interface Session {
  id: string;
  title: string;
  description?: string;
  topicId?: string;                    // Optional link to existing Topic

  // Discord context
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;

  // State
  status: SessionStatus;
  mode: SessionMode;
  isRecording: boolean;

  // Participants
  facilitatorId: string;               // Discord user ID
  speakerId?: string;                  // Current speaker (Discord user ID)
  speakerStartedAt?: number;

  // Timing
  scheduledAt?: number;
  startedAt?: number;
  endedAt?: number;

  // Configuration
  config: SessionConfig;

  // Integration
  webhookUrl?: string;
  webhookSecret?: string;

  createdAt: number;
  createdBy: string;
}

export interface SessionConfig {
  soundEffectsEnabled: boolean;
  autoAdvanceAgenda: boolean;
  speakerTimeLimit?: number;           // Seconds
  allowSelfQueue: boolean;
  requireFacilitatorApproval: boolean;
}

export type ParticipantStatus =
  | 'ready'
  | 'away'
  | 'speaking'
  | 'queued'
  | 'disconnected';

export type ParticipantSignal =
  // Available in ALL modes
  | 'hand'
  | 'away'
  // Available in STRUCTURED mode only
  | 'point_of_order'
  | 'point_of_clarification'
  | 'point_of_information'
  | 'question'
  | 'agree'
  | 'disagree'
  | 'move_to_vote'
  | 'table';

export interface Participant {
  discordId: string;
  discordUsername: string;
  discordAvatar?: string;
  seaPub?: string;                     // GunDB public key if authenticated

  sessionId: string;
  status: ParticipantStatus;
  signal?: ParticipantSignal;
  signalTimestamp?: number;

  joinedAt: number;
  speakingTime: number;
  signalCount: number;
  lastUpdateSource: 'dashboard' | 'discord';
}

export type QueuePriority = 'interrupt' | 'high' | 'normal' | 'low';

export interface SpeakerQueueEntry {
  discordId: string;
  discordUsername: string;
  signal: ParticipantSignal;
  timestamp: number;
  priority: QueuePriority;
  acknowledged: boolean;
}

export type AgendaItemStatus = 'pending' | 'active' | 'completed' | 'skipped';

export interface AgendaItem {
  id: string;
  title: string;
  description?: string;
  duration?: number;                   // Estimated minutes
  status: AgendaItemStatus;
  startedAt?: number;
  completedAt?: number;
  addedBy: string;
  addedAt: number;
}

export interface Agenda {
  sessionId: string;
  items: AgendaItem[];
  currentItemIndex: number;
}

// Webhook event types
export type WebhookEventType =
  | 'signal_raised'
  | 'speaker_changed'
  | 'mode_changed'
  | 'recording_changed'
  | 'agenda_advanced'
  | 'session_ended';

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: number;
  session: {
    id: string;
    guildId: string;
    voiceChannelId: string;
    textChannelId: string;
  };
  data: Record<string, unknown>;
}

// Signal priority mapping
export const SIGNAL_PRIORITIES: Record<ParticipantSignal, QueuePriority> = {
  point_of_order: 'interrupt',
  point_of_clarification: 'high',
  point_of_information: 'high',
  hand: 'normal',
  question: 'normal',
  move_to_vote: 'normal',
  table: 'normal',
  agree: 'low',
  disagree: 'low',
  away: 'low'
};

// Signals that add to queue vs just display
export const QUEUE_SIGNALS: ParticipantSignal[] = [
  'hand',
  'point_of_order',
  'point_of_clarification',
  'point_of_information',
  'question',
  'move_to_vote',
  'table'
];

// Signals only available in structured mode
export const STRUCTURED_ONLY_SIGNALS: ParticipantSignal[] = [
  'point_of_order',
  'point_of_clarification',
  'point_of_information',
  'question',
  'agree',
  'disagree',
  'move_to_vote',
  'table'
];
