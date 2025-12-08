import { useState, useEffect, useCallback } from 'react';
import { gun, user } from '../lib/gun';
import type { Topic, Interest, PublicTopicRef } from '../types';

/**
 * Hook for managing topics with SEA-authenticated writes
 */
export function useTopics() {
  const [topics, setTopics] = useState<Map<string, Topic>>(new Map());
  const [interests, setInterests] = useState<Map<string, Map<string, Interest>>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to public topics discovery graph
  useEffect(() => {
    const publicTopics = gun.get('public-topics');
    const publicInterests = gun.get('topic-interests');

    publicTopics.map().on((data: PublicTopicRef | null, id: string) => {
      if (!data || !id) return;

      // First, store the public topic data as a fallback
      // This ensures test-created topics (via server) are visible
      const publicTopic: Topic = {
        id: data.id,
        title: data.title,
        description: (data as any).description || '',
        presenter: data.presenter,
        presenterEmail: (data as any).presenterEmail || '',
        presenterPub: data.presenterPub,
        minParticipants: data.minParticipants,
        duration: (data as any).duration || 60,
        type: (data as any).type || 'presentation',
        stage: data.stage,
        createdAt: data.createdAt,
      };

      // Set public data immediately
      setTopics((prev) => {
        const next = new Map(prev);
        // Only set if we don't already have full data from user space
        if (!prev.has(id) || !prev.get(id)?.description) {
          next.set(id, publicTopic);
        }
        return next;
      });

      // Then try to fetch full topic from author's user space
      if (data.presenterPub) {
        gun.user(data.presenterPub).get('topics').get(id).on((topicData: Topic | null) => {
          if (topicData && topicData.title) {
            setTopics((prev) => {
              const next = new Map(prev);
              next.set(id, topicData);
              return next;
            });
          }
        });

        // Subscribe to interests from public graph
        publicInterests.get(id).map().on((interest: Interest | null, intKey: string) => {
          if (intKey) {
            setInterests((prev) => {
              const next = new Map(prev);
              const topicInterests = new Map(next.get(id) || new Map());
              if (interest) {
                topicInterests.set(intKey, interest);
              } else {
                topicInterests.delete(intKey);
              }
              next.set(id, topicInterests);
              return next;
            });
          }
        });
      }
    });

    setIsLoading(false);

    return () => {
      // Cleanup subscriptions
      publicTopics.map().off();
    };
  }, []);

  // Auto-transition to stage 2 when interest threshold is met
  useEffect(() => {
    if (!user.is?.pub) return;

    topics.forEach((topic) => {
      // Only check stage 1 topics owned by current user
      if (topic.stage !== 1 || topic.presenterPub !== user.is?.pub) return;

      const topicInterests = interests.get(topic.id);
      if (!topicInterests) return;

      // Count interests excluding creator
      const interestCount = Array.from(topicInterests.keys()).filter(
        (pub) => pub !== topic.presenterPub
      ).length;

      // Move to stage 2 if threshold met
      if (interestCount >= topic.minParticipants) {
        console.log(`Topic "${topic.title}" reached threshold, moving to stage 2`);
        user.get('topics').get(topic.id).get('stage').put(2 as any);
        gun.get('public-topics').get(topic.id).get('stage').put(2 as any);
      }
    });
  }, [topics, interests]);

  /**
   * Create a new topic (writes to authenticated user's space)
   */
  const createTopic = useCallback(
    async (topicData: Omit<Topic, 'id' | 'createdAt' | 'presenterPub' | 'stage'>) => {
      if (!user.is?.pub) {
        throw new Error('Must be authenticated to create topics');
      }

      const id = `topic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Build topic object, filtering out undefined values (GunDB doesn't handle them well)
      const topic: Topic = {
        id,
        title: topicData.title,
        description: topicData.description,
        presenter: topicData.presenter,
        presenterEmail: topicData.presenterEmail,
        presenterPub: user.is.pub,
        minParticipants: topicData.minParticipants,
        duration: topicData.duration,
        type: topicData.type,
        stage: 1,
        createdAt: Date.now(),
      };

      // Only add optional fields if they have values
      if (topicData.maxParticipants !== undefined) {
        topic.maxParticipants = topicData.maxParticipants;
      }
      if (topicData.recurrence !== undefined) {
        topic.recurrence = topicData.recurrence;
      }
      if (topicData.schedulingConfig !== undefined) {
        topic.schedulingConfig = topicData.schedulingConfig;
      }

      // Write to user's protected space (only this user can write)
      user.get('topics').get(id).put(topic as any);

      // Add to public discovery graph
      const publicRef: PublicTopicRef = {
        id,
        title: topic.title,
        presenter: topic.presenter,
        presenterPub: user.is.pub,
        minParticipants: topic.minParticipants,
        stage: 1,
        interestCount: 0,
        createdAt: topic.createdAt,
      };
      gun.get('public-topics').get(id).put(publicRef as any);

      return topic;
    },
    []
  );

  /**
   * Update an existing topic (only owner can update)
   */
  const updateTopic = useCallback(
    async (topicId: string, updates: Partial<Omit<Topic, 'id' | 'createdAt' | 'presenterPub'>>) => {
      if (!user.is?.pub) {
        throw new Error('Must be authenticated to update topics');
      }

      // Build update object, filtering out undefined values
      const cleanUpdates: Record<string, unknown> = {};

      if (updates.title !== undefined) cleanUpdates.title = updates.title;
      if (updates.description !== undefined) cleanUpdates.description = updates.description;
      if (updates.presenter !== undefined) cleanUpdates.presenter = updates.presenter;
      if (updates.presenterEmail !== undefined) cleanUpdates.presenterEmail = updates.presenterEmail;
      if (updates.minParticipants !== undefined) cleanUpdates.minParticipants = updates.minParticipants;
      if (updates.maxParticipants !== undefined) cleanUpdates.maxParticipants = updates.maxParticipants;
      if (updates.duration !== undefined) cleanUpdates.duration = updates.duration;
      if (updates.type !== undefined) cleanUpdates.type = updates.type;
      if (updates.recurrence !== undefined) cleanUpdates.recurrence = updates.recurrence;
      if (updates.stage !== undefined) cleanUpdates.stage = updates.stage;
      if (updates.schedulingConfig !== undefined) cleanUpdates.schedulingConfig = updates.schedulingConfig;

      // Update in user's protected space
      user.get('topics').get(topicId).put(cleanUpdates as any);

      // Update public discovery graph with relevant fields
      const publicUpdates: Record<string, unknown> = {};
      if (updates.title !== undefined) publicUpdates.title = updates.title;
      if (updates.presenter !== undefined) publicUpdates.presenter = updates.presenter;
      if (updates.minParticipants !== undefined) publicUpdates.minParticipants = updates.minParticipants;
      if (updates.stage !== undefined) publicUpdates.stage = updates.stage;

      if (Object.keys(publicUpdates).length > 0) {
        gun.get('public-topics').get(topicId).put(publicUpdates as any);
      }
    },
    []
  );

  /**
   * Express interest in a topic
   * Interests are stored in a public graph (not user space) so anyone can write
   */
  const toggleInterest = useCallback(
    async (topicId: string, _presenterPub: string, userName: string, userEmail: string) => {
      if (!user.is?.pub) {
        throw new Error('Must be authenticated to express interest');
      }

      const myPub = user.is.pub;
      const currentInterests = interests.get(topicId);
      const isCurrentlyInterested = currentInterests?.has(myPub);

      // Store interests in public graph (anyone can write)
      const interestRef = gun.get('topic-interests').get(topicId).get(myPub);

      if (isCurrentlyInterested) {
        // Remove interest
        interestRef.put(null as any);
        // Update local state immediately
        setInterests((prev) => {
          const next = new Map(prev);
          const topicInterests = new Map(next.get(topicId) || new Map());
          topicInterests.delete(myPub);
          next.set(topicId, topicInterests);
          return next;
        });
      } else {
        // Add interest
        const interest: Interest = {
          name: userName,
          email: userEmail,
          pub: myPub,
          timestamp: Date.now(),
        };
        interestRef.put(interest as any);
      }
    },
    [interests]
  );

  /**
   * Move topic to stage 2 (only topic owner can do this)
   */
  const moveToStage2 = useCallback(async (topicId: string) => {
    if (!user.is?.pub) {
      throw new Error('Must be authenticated');
    }

    user.get('topics').get(topicId).get('stage').put(2 as any);
    gun.get('public-topics').get(topicId).get('stage').put(2 as any);
  }, []);

  /**
   * Schedule a topic (only topic owner can do this)
   */
  const scheduleTopic = useCallback(async (topicId: string, scheduledTime: number) => {
    if (!user.is?.pub) {
      throw new Error('Must be authenticated');
    }

    user.get('topics').get(topicId).put({
      stage: 3,
      scheduledTime,
    } as any);

    gun.get('public-topics').get(topicId).put({
      stage: 3,
    } as any);
  }, []);

  
  // Convert map to array for easier rendering
  const topicsArray = Array.from(topics.values());
  const stage1Topics = topicsArray.filter((t) => t.stage === 1);
  const stage2Topics = topicsArray.filter((t) => t.stage === 2);
  const scheduledTopics = topicsArray.filter((t) => t.stage === 3);

  return {
    topics: topicsArray,
    stage1Topics,
    stage2Topics,
    scheduledTopics,
    interests,
    isLoading,
    createTopic,
    updateTopic,
    toggleInterest,
    moveToStage2,
    scheduleTopic,
  };
}
