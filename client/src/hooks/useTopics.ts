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

    publicTopics.map().on((data: PublicTopicRef | null, id: string) => {
      if (!data || !id) return;

      // Fetch full topic from author's user space
      if (data.presenterPub) {
        gun.user(data.presenterPub).get('topics').get(id).on((topicData: Topic | null) => {
          if (topicData) {
            setTopics((prev) => {
              const next = new Map(prev);
              next.set(id, topicData);
              return next;
            });
          }
        });

        // Subscribe to interests for this topic
        gun.user(data.presenterPub).get('topics').get(id).get('interests').map().on((interest: Interest | null, intKey: string) => {
          if (interest && intKey) {
            setInterests((prev) => {
              const next = new Map(prev);
              const topicInterests = new Map(next.get(id) || new Map());
              topicInterests.set(intKey, interest);
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

  /**
   * Create a new topic (writes to authenticated user's space)
   */
  const createTopic = useCallback(
    async (topicData: Omit<Topic, 'id' | 'createdAt' | 'presenterPub' | 'stage'>) => {
      if (!user.is?.pub) {
        throw new Error('Must be authenticated to create topics');
      }

      const id = `topic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const topic: Topic = {
        ...topicData,
        id,
        presenterPub: user.is.pub,
        stage: 1,
        createdAt: Date.now(),
      };

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
   * Express interest in a topic
   */
  const toggleInterest = useCallback(
    async (topicId: string, presenterPub: string, userName: string, userEmail: string) => {
      if (!user.is?.pub) {
        throw new Error('Must be authenticated to express interest');
      }

      const myPub = user.is.pub;
      const currentInterests = interests.get(topicId);
      const isCurrentlyInterested = currentInterests?.has(myPub);

      if (isCurrentlyInterested) {
        // Remove interest - write null to our interest entry
        gun.user(presenterPub).get('topics').get(topicId).get('interests').get(myPub).put(null as any);
      } else {
        // Add interest
        const interest: Interest = {
          name: userName,
          email: userEmail,
          pub: myPub,
          timestamp: Date.now(),
        };
        gun.user(presenterPub).get('topics').get(topicId).get('interests').get(myPub).put(interest as any);
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
    toggleInterest,
    moveToStage2,
    scheduleTopic,
  };
}
