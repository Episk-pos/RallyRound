import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { Topic } from '../types';

interface CreateTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (topic: Omit<Topic, 'id' | 'createdAt' | 'presenterPub' | 'stage'>) => Promise<Topic | void>;
}

export function CreateTopicModal({ isOpen, onClose, onSubmit }: CreateTopicModalProps) {
  const { googleUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    presenter: googleUser?.name || '',
    minParticipants: 5,
    maxParticipants: '',
    duration: 60,
    type: 'one-time' as 'one-time' | 'recurring',
    recurrence: 'weekly' as 'weekly' | 'biweekly' | 'monthly',
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await onSubmit({
        title: formData.title,
        description: formData.description,
        presenter: formData.presenter,
        presenterEmail: googleUser?.email || '',
        minParticipants: formData.minParticipants,
        maxParticipants: formData.maxParticipants ? parseInt(formData.maxParticipants) : undefined,
        duration: formData.duration,
        type: formData.type,
        recurrence: formData.type === 'recurring' ? formData.recurrence : undefined,
      });

      // Reset form
      setFormData({
        title: '',
        description: '',
        presenter: googleUser?.name || '',
        minParticipants: 5,
        maxParticipants: '',
        duration: 60,
        type: 'one-time',
        recurrence: 'weekly',
      });

      onClose();
    } catch (error) {
      console.error('Failed to create topic:', error);
      alert('Failed to create topic');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <span className="close" onClick={onClose}>
          &times;
        </span>
        <h2>Create New Topic</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="topic-title">Title</label>
            <input
              type="text"
              id="topic-title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="topic-description">Description</label>
            <textarea
              id="topic-description"
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="topic-presenter">Presenter</label>
            <input
              type="text"
              id="topic-presenter"
              value={formData.presenter}
              onChange={(e) => setFormData({ ...formData, presenter: e.target.value })}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="topic-min-participants">Minimum Participants</label>
              <input
                type="number"
                id="topic-min-participants"
                min={1}
                value={formData.minParticipants}
                onChange={(e) =>
                  setFormData({ ...formData, minParticipants: parseInt(e.target.value) || 1 })
                }
              />
            </div>

            <div className="form-group">
              <label htmlFor="topic-max-participants">Maximum Participants (optional)</label>
              <input
                type="number"
                id="topic-max-participants"
                min={1}
                value={formData.maxParticipants}
                onChange={(e) => setFormData({ ...formData, maxParticipants: e.target.value })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="topic-duration">Duration (minutes)</label>
              <input
                type="number"
                id="topic-duration"
                min={15}
                step={15}
                value={formData.duration}
                onChange={(e) =>
                  setFormData({ ...formData, duration: parseInt(e.target.value) || 60 })
                }
              />
            </div>

            <div className="form-group">
              <label htmlFor="topic-type">Session Type</label>
              <select
                id="topic-type"
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value as 'one-time' | 'recurring' })
                }
              >
                <option value="one-time">One-time</option>
                <option value="recurring">Recurring</option>
              </select>
            </div>
          </div>

          {formData.type === 'recurring' && (
            <div className="form-group">
              <label htmlFor="topic-recurrence">Recurrence</label>
              <select
                id="topic-recurrence"
                value={formData.recurrence}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    recurrence: e.target.value as 'weekly' | 'biweekly' | 'monthly',
                  })
                }
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Topic'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
