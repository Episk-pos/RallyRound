import { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import type { Notification } from '../types';

interface NotificationBellProps {
  onTopicClick?: (topicId: string) => void;
}

export function NotificationBell({ onTopicClick }: NotificationBellProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    if (onTopicClick) {
      onTopicClick(notification.topicId);
    }
    setIsOpen(false);
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'slot_invalidated':
        return '⚠️';
      case 'consensus_reached':
        return '🎉';
      case 'scheduled':
        return '📅';
      case 'preference_needed':
        return '🗳️';
      case 'availability_needed':
        return '📋';
      default:
        return '🔔';
    }
  };

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button
        className="bell-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && <span className="badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="dropdown-header">
            <h4>Notifications</h4>
            {unreadCount > 0 && (
              <button className="mark-all-read" onClick={markAllAsRead}>
                Mark all read
              </button>
            )}
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="empty-notifications">No notifications</div>
            ) : (
              notifications.slice(0, 10).map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${notification.read ? 'read' : 'unread'}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <span className="notification-icon">{getNotificationIcon(notification.type)}</span>
                  <div className="notification-content">
                    <div className="notification-message">{notification.message}</div>
                    <div className="notification-meta">
                      <span className="notification-topic">{notification.topicTitle}</span>
                      <span className="notification-time">{formatTime(notification.createdAt)}</span>
                    </div>
                  </div>
                  <button
                    className="notification-dismiss"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(notification.id);
                    }}
                    aria-label="Dismiss notification"
                  >
                    &times;
                  </button>
                </div>
              ))
            )}
          </div>

          {notifications.length > 10 && (
            <div className="dropdown-footer">
              <span>{notifications.length - 10} more notifications</span>
            </div>
          )}
        </div>
      )}

      <style>{`
        .notification-bell {
          position: relative;
        }

        .bell-button {
          background: none;
          border: none;
          padding: 8px;
          cursor: pointer;
          position: relative;
          color: var(--text-color, #333);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .bell-button:hover {
          opacity: 0.8;
        }

        .badge {
          position: absolute;
          top: 2px;
          right: 2px;
          background: var(--danger-color, #dc3545);
          color: white;
          font-size: 0.65rem;
          font-weight: bold;
          min-width: 16px;
          height: 16px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
        }

        .notification-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          width: 320px;
          max-height: 400px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          z-index: 1000;
          overflow: hidden;
        }

        .dropdown-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color, #dee2e6);
        }

        .dropdown-header h4 {
          margin: 0;
          font-size: 0.95rem;
        }

        .mark-all-read {
          background: none;
          border: none;
          color: var(--primary-color, #4a90d9);
          font-size: 0.8rem;
          cursor: pointer;
          padding: 4px 8px;
        }

        .mark-all-read:hover {
          text-decoration: underline;
        }

        .notification-list {
          max-height: 320px;
          overflow-y: auto;
        }

        .empty-notifications {
          padding: 24px;
          text-align: center;
          color: var(--text-muted, #6c757d);
        }

        .notification-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px 16px;
          cursor: pointer;
          transition: background 0.2s;
          border-bottom: 1px solid var(--border-color, #dee2e6);
        }

        .notification-item:last-child {
          border-bottom: none;
        }

        .notification-item:hover {
          background: var(--light-bg, #f8f9fa);
        }

        .notification-item.unread {
          background: var(--primary-bg, #e7f1ff);
        }

        .notification-item.unread:hover {
          background: #d4e5fc;
        }

        .notification-icon {
          font-size: 1.2rem;
          flex-shrink: 0;
        }

        .notification-content {
          flex: 1;
          min-width: 0;
        }

        .notification-message {
          font-size: 0.9rem;
          margin-bottom: 4px;
          word-wrap: break-word;
        }

        .notification-meta {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: var(--text-muted, #6c757d);
        }

        .notification-topic {
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .notification-dismiss {
          background: none;
          border: none;
          font-size: 1.2rem;
          color: var(--text-muted, #6c757d);
          cursor: pointer;
          padding: 0;
          line-height: 1;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .notification-item:hover .notification-dismiss {
          opacity: 1;
        }

        .notification-dismiss:hover {
          color: var(--danger-color, #dc3545);
        }

        .dropdown-footer {
          padding: 8px 16px;
          text-align: center;
          font-size: 0.8rem;
          color: var(--text-muted, #6c757d);
          border-top: 1px solid var(--border-color, #dee2e6);
        }
      `}</style>
    </div>
  );
}
