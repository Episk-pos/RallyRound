import { useState, useEffect, useCallback, useRef } from 'react';
import { gun } from '../lib/gun';
import type {
  Session,
  Participant,
  SpeakerQueueEntry,
  Agenda,
  AgendaItem,
  ParticipantSignal,
  QueuePriority,
  SIGNAL_PRIORITIES,
  QUEUE_SIGNALS,
  STRUCTURED_ONLY_SIGNALS
} from '../types';

// Signal priority mapping
const signalPriorities: Record<ParticipantSignal, QueuePriority> = {
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

interface UseSessionOptions {
  sessionId: string;
  token?: string;
}

interface UseSessionReturn {
  // State
  session: Session | null;
  participants: Participant[];
  queue: SpeakerQueueEntry[];
  agenda: Agenda | null;
  loading: boolean;
  error: string | null;

  // Current user state
  currentParticipant: Participant | null;
  isFacilitator: boolean;
  isSpeaker: boolean;
  isInQueue: boolean;

  // Actions
  raiseSignal: (signal: ParticipantSignal) => Promise<void>;
  clearSignal: () => Promise<void>;
  setAway: (away: boolean) => Promise<void>;

  // Facilitator actions
  setMode: (mode: 'unstructured' | 'structured') => Promise<void>;
  setRecording: (recording: boolean) => Promise<void>;
  setSpeaker: (discordId: string) => Promise<void>;
  nextSpeaker: () => Promise<void>;
  clearSpeaker: () => Promise<void>;
  clearQueue: () => Promise<void>;
  endSession: () => Promise<void>;

  // Agenda actions
  addAgendaItem: (title: string, description?: string, duration?: number) => Promise<void>;
  updateAgendaItem: (itemId: string, updates: Partial<AgendaItem>) => Promise<void>;
  removeAgendaItem: (itemId: string) => Promise<void>;
  advanceAgenda: () => Promise<void>;
}

export function useSession({ sessionId, token }: UseSessionOptions): UseSessionReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [queue, setQueue] = useState<SpeakerQueueEntry[]>([]);
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const apiBase = import.meta.env.VITE_API_URL || '';
  const subscriptionsRef = useRef<(() => void)[]>([]);

  // Get auth headers
  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  // Fetch current user ID from token validation
  useEffect(() => {
    if (!token) return;

    const discordStatsUrl = import.meta.env.VITE_DISCORDSTATS_URL || 'http://localhost:3001';

    fetch(`${discordStatsUrl}/auth/user`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.id) {
          setCurrentUserId(data.id);
        }
      })
      .catch(err => console.error('Failed to get user:', err));
  }, [token]);

  // Subscribe to GunDB for real-time updates
  useEffect(() => {
    if (!sessionId) return;

    setLoading(true);
    const cleanups: (() => void)[] = [];

    // Subscribe to session meta
    const sessionRef = gun.get('live-sessions').get(sessionId).get('meta');
    const sessionHandler = sessionRef.on((data: Session | null) => {
      if (data && data.id) {
        setSession(data);
        setError(null);
      }
    });
    cleanups.push(() => sessionRef.off());

    // Subscribe to participants
    const participantsRef = gun.get('live-sessions').get(sessionId).get('participants');
    const participantsMap = new Map<string, Participant>();

    participantsRef.map().on((data: Participant | null, key: string) => {
      if (data && data.discordId) {
        participantsMap.set(key, data);
      } else {
        participantsMap.delete(key);
      }
      setParticipants(Array.from(participantsMap.values()));
    });
    cleanups.push(() => participantsRef.off());

    // Subscribe to queue
    const queueRef = gun.get('live-sessions').get(sessionId).get('queue');
    const queueMap = new Map<string, SpeakerQueueEntry>();

    queueRef.map().on((data: SpeakerQueueEntry | null, key: string) => {
      if (data && data.discordId) {
        queueMap.set(key, data);
      } else {
        queueMap.delete(key);
      }

      // Sort queue by priority then timestamp
      const sorted = Array.from(queueMap.values()).sort((a, b) => {
        const priorityOrder: Record<QueuePriority, number> = {
          interrupt: 0,
          high: 1,
          normal: 2,
          low: 3
        };
        const aPriority = priorityOrder[a.priority] ?? 2;
        const bPriority = priorityOrder[b.priority] ?? 2;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.timestamp - b.timestamp;
      });

      setQueue(sorted);
    });
    cleanups.push(() => queueRef.off());

    // Subscribe to agenda
    const agendaRef = gun.get('live-sessions').get(sessionId).get('agenda');
    agendaRef.on((data: { sessionId: string; currentItemIndex: number; items: string } | null) => {
      if (data && data.sessionId) {
        setAgenda({
          sessionId: data.sessionId,
          currentItemIndex: data.currentItemIndex,
          items: JSON.parse(data.items || '[]')
        });
      }
    });
    cleanups.push(() => agendaRef.off());

    // Set loading false after initial fetch
    setTimeout(() => setLoading(false), 1000);

    subscriptionsRef.current = cleanups;

    return () => {
      cleanups.forEach(cleanup => cleanup());
    };
  }, [sessionId]);

  // Computed values
  const currentParticipant = participants.find(p => p.discordId === currentUserId) || null;
  const isFacilitator = session?.facilitatorId === currentUserId;
  const isSpeaker = session?.speakerId === currentUserId;
  const isInQueue = queue.some(q => q.discordId === currentUserId);

  // API call helper
  const apiCall = useCallback(async (
    path: string,
    method: string = 'GET',
    body?: Record<string, unknown>
  ) => {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: getHeaders(),
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'API call failed');
    }

    return response.json();
  }, [apiBase, getHeaders]);

  // Signal actions
  const raiseSignal = useCallback(async (signal: ParticipantSignal) => {
    if (!currentUserId) throw new Error('Not authenticated');
    await apiCall(`/api/sessions/${sessionId}/signals`, 'POST', {
      discordId: currentUserId,
      signal
    });
  }, [sessionId, currentUserId, apiCall]);

  const clearSignal = useCallback(async () => {
    if (!currentUserId) throw new Error('Not authenticated');
    await apiCall(`/api/sessions/${sessionId}/signals/${currentUserId}`, 'DELETE');
  }, [sessionId, currentUserId, apiCall]);

  const setAway = useCallback(async (away: boolean) => {
    if (!currentUserId) throw new Error('Not authenticated');
    await apiCall(`/api/sessions/${sessionId}/participants/${currentUserId}`, 'PATCH', {
      status: away ? 'away' : 'ready'
    });
  }, [sessionId, currentUserId, apiCall]);

  // Facilitator actions
  const setMode = useCallback(async (mode: 'unstructured' | 'structured') => {
    if (!isFacilitator) throw new Error('Not facilitator');
    await apiCall(`/api/sessions/${sessionId}`, 'PATCH', { mode });
  }, [sessionId, isFacilitator, apiCall]);

  const setRecording = useCallback(async (isRecording: boolean) => {
    if (!isFacilitator) throw new Error('Not facilitator');
    await apiCall(`/api/sessions/${sessionId}`, 'PATCH', { isRecording });
  }, [sessionId, isFacilitator, apiCall]);

  const setSpeaker = useCallback(async (discordId: string) => {
    if (!isFacilitator) throw new Error('Not facilitator');
    await apiCall(`/api/sessions/${sessionId}/speaker`, 'POST', { discordId });
  }, [sessionId, isFacilitator, apiCall]);

  const nextSpeaker = useCallback(async () => {
    if (!isFacilitator) throw new Error('Not facilitator');
    await apiCall(`/api/sessions/${sessionId}/speaker/next`, 'POST');
  }, [sessionId, isFacilitator, apiCall]);

  const clearSpeaker = useCallback(async () => {
    if (!isFacilitator) throw new Error('Not facilitator');
    await apiCall(`/api/sessions/${sessionId}/speaker`, 'DELETE');
  }, [sessionId, isFacilitator, apiCall]);

  const clearQueue = useCallback(async () => {
    if (!isFacilitator) throw new Error('Not facilitator');
    await apiCall(`/api/sessions/${sessionId}/speaker/queue`, 'DELETE');
  }, [sessionId, isFacilitator, apiCall]);

  const endSession = useCallback(async () => {
    if (!isFacilitator) throw new Error('Not facilitator');
    await apiCall(`/api/sessions/${sessionId}`, 'DELETE');
  }, [sessionId, isFacilitator, apiCall]);

  // Agenda actions
  const addAgendaItem = useCallback(async (title: string, description?: string, duration?: number) => {
    await apiCall(`/api/sessions/${sessionId}/agenda`, 'POST', {
      title,
      description,
      duration
    });
  }, [sessionId, apiCall]);

  const updateAgendaItem = useCallback(async (itemId: string, updates: Partial<AgendaItem>) => {
    await apiCall(`/api/sessions/${sessionId}/agenda/${itemId}`, 'PATCH', updates);
  }, [sessionId, apiCall]);

  const removeAgendaItem = useCallback(async (itemId: string) => {
    if (!isFacilitator) throw new Error('Not facilitator');
    await apiCall(`/api/sessions/${sessionId}/agenda/${itemId}`, 'DELETE');
  }, [sessionId, isFacilitator, apiCall]);

  const advanceAgenda = useCallback(async () => {
    if (!isFacilitator) throw new Error('Not facilitator');
    await apiCall(`/api/sessions/${sessionId}/agenda/next`, 'POST');
  }, [sessionId, isFacilitator, apiCall]);

  return {
    session,
    participants,
    queue,
    agenda,
    loading,
    error,
    currentParticipant,
    isFacilitator,
    isSpeaker,
    isInQueue,
    raiseSignal,
    clearSignal,
    setAway,
    setMode,
    setRecording,
    setSpeaker,
    nextSpeaker,
    clearSpeaker,
    clearQueue,
    endSession,
    addAgendaItem,
    updateAgendaItem,
    removeAgendaItem,
    advanceAgenda
  };
}
