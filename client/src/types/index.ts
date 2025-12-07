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
}

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
