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
