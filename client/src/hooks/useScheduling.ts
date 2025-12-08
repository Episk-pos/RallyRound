import { useState, useEffect, useCallback } from 'react';
import { gun, user } from '../lib/gun';
import type { Topic, TimeSlot, SchedulingPreference, AvailabilityWindow } from '../types';

interface UseSchedulingOptions {
  topic: Topic;
}

interface SlotWithVotes extends TimeSlot {
  votes: string[]; // pub keys of users who selected this slot
  voterNames: string[]; // names of voters for display
}

/**
 * Hook for managing the scheduling flow for a topic
 */
export function useScheduling({ topic }: UseSchedulingOptions) {
  const [slots, setSlots] = useState<SlotWithVotes[]>([]);
  const [preferences, setPreferences] = useState<Map<string, SchedulingPreference>>(new Map());
  const [isGeneratingSlots, setIsGeneratingSlots] = useState(false);
  const [mySelectedSlots, setMySelectedSlots] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to scheduling data
  useEffect(() => {
    const schedulingRef = gun.get('topic-scheduling').get(topic.id);

    // Subscribe to proposed slots
    schedulingRef.get('slots').map().on((data: TimeSlot | null, id: string) => {
      if (!id) return;

      setSlots((prev) => {
        const newSlots = [...prev];
        const existingIndex = newSlots.findIndex((s) => s.id === id);

        if (data) {
          const slotWithVotes: SlotWithVotes = {
            ...data,
            votes: [],
            voterNames: [],
          };

          if (existingIndex >= 0) {
            newSlots[existingIndex] = { ...newSlots[existingIndex], ...slotWithVotes };
          } else {
            newSlots.push(slotWithVotes);
          }
        } else if (existingIndex >= 0) {
          newSlots.splice(existingIndex, 1);
        }

        return newSlots.sort((a, b) => b.score - a.score || a.start - b.start);
      });
    });

    // Subscribe to preferences
    schedulingRef.get('preferences').map().on((data: SchedulingPreference | null, pub: string) => {
      if (!pub) return;

      setPreferences((prev) => {
        const newPrefs = new Map(prev);
        if (data) {
          newPrefs.set(pub, data);
        } else {
          newPrefs.delete(pub);
        }
        return newPrefs;
      });
    });

    setIsLoading(false);

    return () => {
      schedulingRef.get('slots').map().off();
      schedulingRef.get('preferences').map().off();
    };
  }, [topic.id]);

  // Update slots with vote information when preferences change
  useEffect(() => {
    setSlots((prev) => {
      return prev.map((slot) => {
        const votes: string[] = [];
        const voterNames: string[] = [];

        preferences.forEach((pref, pub) => {
          if (pref.selectedSlots?.includes(slot.id)) {
            votes.push(pub);
            voterNames.push(pref.userName);
          }
        });

        return { ...slot, votes, voterNames };
      });
    });
  }, [preferences]);

  // Load current user's selections
  useEffect(() => {
    if (!user.is?.pub) return;

    const myPref = preferences.get(user.is.pub);
    if (myPref?.selectedSlots) {
      setMySelectedSlots(myPref.selectedSlots);
    }
  }, [preferences]);

  /**
   * Generate time slot suggestions based on participant availability
   */
  const generateSlots = useCallback(async () => {
    setIsGeneratingSlots(true);

    try {
      // Collect availability from all preferences
      const participantAvailability: Array<{ busySlots: Array<{ start: number; end: number }> }> = [];

      preferences.forEach((pref) => {
        // Convert availability windows to busy slots (inverse)
        const availability = pref.availability || [];
        // For now, just pass the availability as-is; the backend handles conversion
        participantAvailability.push({ busySlots: [] }); // Simplified for now
      });

      const response = await fetch('/scheduling/generate-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          duration: topic.duration,
          windowDays: topic.schedulingConfig?.schedulingWindowDays || 14,
          participantAvailability,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate slots');
      }

      const { slots: newSlots } = await response.json();

      // Store slots in GunDB
      const schedulingRef = gun.get('topic-scheduling').get(topic.id).get('slots');

      for (const slot of newSlots) {
        schedulingRef.get(slot.id).put(slot as any);
      }

      // Update generation timestamp
      gun.get('topic-scheduling').get(topic.id).get('slotGeneratedAt').put(Date.now() as any);

      return newSlots;
    } catch (error) {
      console.error('Error generating slots:', error);
      throw error;
    } finally {
      setIsGeneratingSlots(false);
    }
  }, [topic, preferences]);

  /**
   * Toggle selection of a time slot
   */
  const toggleSlotSelection = useCallback(
    async (slotId: string) => {
      if (!user.is?.pub) {
        throw new Error('Must be authenticated to select slots');
      }

      const isSelected = mySelectedSlots.includes(slotId);
      const newSelections = isSelected
        ? mySelectedSlots.filter((id) => id !== slotId)
        : [...mySelectedSlots, slotId];

      setMySelectedSlots(newSelections);

      // Update preference in GunDB
      const prefRef = gun.get('topic-scheduling').get(topic.id).get('preferences').get(user.is.pub);
      prefRef.get('selectedSlots').put(newSelections as any);
      prefRef.get('timestamp').put(Date.now() as any);
    },
    [topic.id, mySelectedSlots]
  );

  /**
   * Submit complete preference (availability + selections)
   */
  const submitPreference = useCallback(
    async (userName: string, userEmail: string, availability: AvailabilityWindow[]) => {
      if (!user.is?.pub) {
        throw new Error('Must be authenticated to submit preference');
      }

      const preference: SchedulingPreference = {
        userPub: user.is.pub,
        userName,
        userEmail,
        selectedSlots: mySelectedSlots,
        availability,
        calendarSyncedAt: availability.some((w) => w.source === 'google') ? Date.now() : undefined,
        timestamp: Date.now(),
      };

      gun.get('topic-scheduling').get(topic.id).get('preferences').get(user.is.pub).put(preference as any);

      return preference;
    },
    [topic.id, mySelectedSlots]
  );

  /**
   * Calculate consensus progress
   */
  const getConsensusProgress = useCallback(() => {
    const threshold = topic.schedulingConfig?.consensusThreshold || 75;
    const totalParticipants = preferences.size;

    if (totalParticipants === 0 || slots.length === 0) {
      return {
        threshold,
        topSlot: null,
        topSlotVotes: 0,
        topSlotPercentage: 0,
        consensusReached: false,
        participantsVoted: 0,
        totalParticipants,
      };
    }

    // Find slot with most votes
    let topSlot = slots[0];
    let topSlotVotes = topSlot?.votes?.length || 0;

    for (const slot of slots) {
      const voteCount = slot.votes?.length || 0;
      if (voteCount > topSlotVotes) {
        topSlot = slot;
        topSlotVotes = voteCount;
      }
    }

    const topSlotPercentage = Math.round((topSlotVotes / totalParticipants) * 100);
    const consensusReached = topSlotPercentage >= threshold;

    // Count participants who have voted
    const participantsVoted = Array.from(preferences.values()).filter(
      (p) => p.selectedSlots && p.selectedSlots.length > 0
    ).length;

    return {
      threshold,
      topSlot,
      topSlotVotes,
      topSlotPercentage,
      consensusReached,
      participantsVoted,
      totalParticipants,
    };
  }, [topic, preferences, slots]);

  /**
   * Check if slot generation is locked (enough selections made)
   */
  const isSlotGenerationLocked = useCallback(() => {
    const lockThreshold = topic.schedulingConfig?.lockAfterSelections || 3;
    const participantsWithSelections = Array.from(preferences.values()).filter(
      (p) => p.selectedSlots && p.selectedSlots.length > 0
    ).length;

    return participantsWithSelections >= lockThreshold;
  }, [topic, preferences]);

  /**
   * Get availability grid data for visualization
   */
  const getAvailabilityGrid = useCallback(() => {
    const grid: Array<{
      slot: SlotWithVotes;
      participantAvailability: Array<{
        pub: string;
        name: string;
        available: boolean;
        selected: boolean;
      }>;
    }> = [];

    for (const slot of slots) {
      const participantAvailability: Array<{
        pub: string;
        name: string;
        available: boolean;
        selected: boolean;
      }> = [];

      preferences.forEach((pref, pub) => {
        // Check if participant is available during this slot
        const available = (pref.availability || []).some(
          (window) => window.start <= slot.start && window.end >= slot.end
        );

        const selected = pref.selectedSlots?.includes(slot.id) || false;

        participantAvailability.push({
          pub,
          name: pref.userName,
          available,
          selected,
        });
      });

      grid.push({ slot, participantAvailability });
    }

    return grid;
  }, [slots, preferences]);

  return {
    slots,
    preferences,
    mySelectedSlots,
    isLoading,
    isGeneratingSlots,
    generateSlots,
    toggleSlotSelection,
    submitPreference,
    getConsensusProgress,
    isSlotGenerationLocked,
    getAvailabilityGrid,
  };
}
