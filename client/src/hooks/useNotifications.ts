import { useState, useEffect, useCallback } from 'react';
import { gun, user } from '../lib/gun';
import type { Notification, NotificationType } from '../types';

/**
 * Hook for managing user notifications
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to notifications for current user
  useEffect(() => {
    if (!user.is?.pub) {
      setIsLoading(false);
      return;
    }

    const notificationsRef = gun.get('user-notifications').get(user.is.pub);

    notificationsRef.map().on((data: Notification | null, id: string) => {
      if (!id) return;

      setNotifications((prev) => {
        const newNotifications = [...prev];
        const existingIndex = newNotifications.findIndex((n) => n.id === id);

        if (data) {
          if (existingIndex >= 0) {
            newNotifications[existingIndex] = data;
          } else {
            newNotifications.push(data);
          }
        } else if (existingIndex >= 0) {
          newNotifications.splice(existingIndex, 1);
        }

        // Sort by creation time, newest first
        return newNotifications.sort((a, b) => b.createdAt - a.createdAt);
      });
    });

    setIsLoading(false);

    return () => {
      notificationsRef.map().off();
    };
  }, []);

  /**
   * Create a notification for a user
   */
  const createNotification = useCallback(
    async (
      targetUserPub: string,
      type: NotificationType,
      topicId: string,
      topicTitle: string,
      message: string
    ) => {
      const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const notification: Notification = {
        id,
        userPub: targetUserPub,
        type,
        topicId,
        topicTitle,
        message,
        read: false,
        createdAt: Date.now(),
      };

      gun.get('user-notifications').get(targetUserPub).get(id).put(notification as any);

      return notification;
    },
    []
  );

  /**
   * Mark a notification as read
   */
  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user.is?.pub) return;

    gun.get('user-notifications').get(user.is.pub).get(notificationId).get('read').put(true as any);
  }, []);

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(async () => {
    if (!user.is?.pub) return;

    const unread = notifications.filter((n) => !n.read);
    for (const notification of unread) {
      gun.get('user-notifications').get(user.is.pub).get(notification.id).get('read').put(true as any);
    }
  }, [notifications]);

  /**
   * Delete a notification
   */
  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!user.is?.pub) return;

    gun.get('user-notifications').get(user.is.pub).get(notificationId).put(null as any);
  }, []);

  /**
   * Clear all notifications
   */
  const clearAll = useCallback(async () => {
    if (!user.is?.pub) return;

    for (const notification of notifications) {
      gun.get('user-notifications').get(user.is.pub).get(notification.id).put(null as any);
    }
  }, [notifications]);

  /**
   * Send notifications to all participants of a topic
   */
  const notifyTopicParticipants = useCallback(
    async (
      topicId: string,
      topicTitle: string,
      type: NotificationType,
      message: string,
      excludePubs: string[] = []
    ) => {
      // Get all preferences (participants) for the topic
      const preferencesRef = gun.get('topic-scheduling').get(topicId).get('preferences');

      preferencesRef.map().once((pref: any, pub: string) => {
        if (pref && pub && !excludePubs.includes(pub)) {
          createNotification(pub, type, topicId, topicTitle, message);
        }
      });
    },
    [createNotification]
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    isLoading,
    createNotification,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    notifyTopicParticipants,
  };
}
