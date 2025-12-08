import { useState, useCallback } from 'react';
import { gun, user } from '../lib/gun';
import type { AvailabilityWindow, SchedulingPreference } from '../types';

interface CalendarAvailability {
  hasCalendar: boolean;
  busySlots: Array<{ start: number; end: number }>;
  timeMin: string;
  timeMax: string;
  error?: string;
}

interface UseAvailabilityOptions {
  topicId: string;
}

/**
 * Hook for managing user availability for a topic
 */
export function useAvailability({ topicId }: UseAvailabilityOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [calendarAvailability, setCalendarAvailability] = useState<CalendarAvailability | null>(null);
  const [manualAvailability, setManualAvailability] = useState<AvailabilityWindow[]>([]);

  /**
   * Fetch availability from Google Calendar
   */
  const fetchCalendarAvailability = useCallback(async (timeMin?: string, timeMax?: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (timeMin) params.append('timeMin', timeMin);
      if (timeMax) params.append('timeMax', timeMax);

      const response = await fetch(`/scheduling/availability?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch calendar availability');
      }

      const data: CalendarAvailability = await response.json();
      setCalendarAvailability(data);
      return data;
    } catch (error) {
      console.error('Error fetching calendar availability:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Add a manual availability window
   */
  const addManualWindow = useCallback((window: Omit<AvailabilityWindow, 'source'>) => {
    const newWindow: AvailabilityWindow = {
      ...window,
      source: 'manual',
    };
    setManualAvailability((prev) => [...prev, newWindow]);
    return newWindow;
  }, []);

  /**
   * Remove a manual availability window
   */
  const removeManualWindow = useCallback((index: number) => {
    setManualAvailability((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Clear all manual availability windows
   */
  const clearManualWindows = useCallback(() => {
    setManualAvailability([]);
  }, []);

  /**
   * Convert busy slots to free windows within a time range
   */
  const convertBusyToFree = useCallback(
    (busySlots: Array<{ start: number; end: number }>, timeMin: number, timeMax: number): AvailabilityWindow[] => {
      if (busySlots.length === 0) {
        return [{ start: timeMin, end: timeMax, source: 'google' }];
      }

      // Sort busy slots by start time
      const sorted = [...busySlots].sort((a, b) => a.start - b.start);
      const freeWindows: AvailabilityWindow[] = [];

      let currentStart = timeMin;
      for (const busy of sorted) {
        if (busy.start > currentStart) {
          freeWindows.push({
            start: currentStart,
            end: busy.start,
            source: 'google',
          });
        }
        currentStart = Math.max(currentStart, busy.end);
      }

      // Add final window if there's time after last busy slot
      if (currentStart < timeMax) {
        freeWindows.push({
          start: currentStart,
          end: timeMax,
          source: 'google',
        });
      }

      return freeWindows;
    },
    []
  );

  /**
   * Get combined availability (calendar + manual)
   */
  const getCombinedAvailability = useCallback((): AvailabilityWindow[] => {
    const windows: AvailabilityWindow[] = [...manualAvailability];

    if (calendarAvailability?.hasCalendar && calendarAvailability.busySlots) {
      const timeMin = new Date(calendarAvailability.timeMin).getTime();
      const timeMax = new Date(calendarAvailability.timeMax).getTime();
      const freeWindows = convertBusyToFree(calendarAvailability.busySlots, timeMin, timeMax);
      windows.push(...freeWindows);
    }

    return windows;
  }, [calendarAvailability, manualAvailability, convertBusyToFree]);

  /**
   * Submit availability preference for a topic
   */
  const submitAvailability = useCallback(
    async (userName: string, userEmail: string, selectedSlots: string[] = []) => {
      if (!user.is?.pub) {
        throw new Error('Must be authenticated to submit availability');
      }

      const preference: SchedulingPreference = {
        userPub: user.is.pub,
        userName,
        userEmail,
        selectedSlots,
        availability: getCombinedAvailability(),
        calendarSyncedAt: calendarAvailability?.hasCalendar ? Date.now() : undefined,
        timestamp: Date.now(),
      };

      // Store in GunDB public scheduling graph
      gun.get('topic-scheduling').get(topicId).get('preferences').get(user.is.pub).put(preference as any);

      return preference;
    },
    [topicId, getCombinedAvailability, calendarAvailability]
  );

  /**
   * Fetch existing preference for current user
   */
  const fetchMyPreference = useCallback((): Promise<SchedulingPreference | null> => {
    return new Promise((resolve) => {
      if (!user.is?.pub) {
        resolve(null);
        return;
      }

      gun
        .get('topic-scheduling')
        .get(topicId)
        .get('preferences')
        .get(user.is.pub)
        .once((data: SchedulingPreference | null) => {
          resolve(data);
        });
    });
  }, [topicId]);

  /**
   * Fetch all preferences for a topic
   */
  const fetchAllPreferences = useCallback((): Promise<Map<string, SchedulingPreference>> => {
    return new Promise((resolve) => {
      const preferences = new Map<string, SchedulingPreference>();

      gun
        .get('topic-scheduling')
        .get(topicId)
        .get('preferences')
        .map()
        .once((data: SchedulingPreference | null, key: string) => {
          if (data && key) {
            preferences.set(key, data);
          }
        });

      // Give GunDB a moment to collect all preferences
      setTimeout(() => resolve(preferences), 500);
    });
  }, [topicId]);

  return {
    isLoading,
    calendarAvailability,
    manualAvailability,
    fetchCalendarAvailability,
    addManualWindow,
    removeManualWindow,
    clearManualWindows,
    getCombinedAvailability,
    submitAvailability,
    fetchMyPreference,
    fetchAllPreferences,
  };
}
