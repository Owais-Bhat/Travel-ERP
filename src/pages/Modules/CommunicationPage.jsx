import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import {
  MdSend, MdCampaign, MdMessage, MdInbox, MdOutbox,
  MdAdd, MdDelete, MdClose, MdSearch, MdCircle,
} from 'react-icons/md';
import { formatDate, truncateText, getInitials } from '../../utils/helpers';

const PRIORITY_STYLES = {
  urgent: 'bg-red-500/20 text-red-300 border border-red-500/30',
  high: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  normal: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  low: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',
};

export default function CommunicationPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  // Tab state
  const [activeTab, setActiveTab] = useState('announcements');

  // ─── Announcements state ───────────────────────────────────────────
  const [announcements, setAnnouncements] = useState([]);
  const [annLoading, setAnnLoading] = useState(true);
  const [showAnnForm, setShowAnnForm] = useState(false);
  const [annForm, setAnnForm] = useState({
    title: '', content: '', priority: 'normal', target_audience: 'all',
  });
  const [annSaving, setAnnSaving] = useState(false);

  // ─── Messages state ────────────────────────────────────────────────
  const [msgTab, setMsgTab] = useState('inbox'); // 'inbox' | 'sent'
  const [inbox, setInbox] = useState([]);
  const [sent, setSent] = useState([]);
  const [msgLoading, setMsgLoading] = useState(true);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showCompose, setShowCompose] = useState(false);
  const [composeForm, setComposeForm] = useState({ subject: '', body: '' });
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientResults, setRecipientResults] = useState([]);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [composeSaving, setComposeSaving] = useState(false);
  const realtimeRef = useRef(null);

  // ─── Load announcements ────────────────────────────────────────────
  const loadAnnouncements = async () => {
    if (!profile?.institution_id) return;
    setAnnLoading(true);
    try {
      const { data } = await api.get('/communication/announcements');
      setAnnouncements(data || []);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load announcements');
    } finally {
      setAnnLoading(false);
    }
  };

  // ─── Load messages ─────────────────────────────────────────────────
  const loadMessages = async () => {
    if (!profile?.id) return;
    setMsgLoading(true);

    try {
      const [inboxRes, sentRes] = await Promise.all([
        api.get('/communication/messages', { params: { box: 'inbox' } }),
        api.get('/communication/messages', { params: { box: 'sent' } }),
      ]);
      setInbox(inboxRes.data?.messages || []);
      setUnreadCount(inboxRes.data?.unread || 0);
      setSent(sentRes.data?.messages || []);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load messages');
    } finally {
      setMsgLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.institution_id) {
      loadAnnouncements();
      loadMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.institution_id]);

  // ─── New-message polling ───────────────────────────────
  // Replaces the Supabase realtime channel: MySQL has no LISTEN/NOTIFY, so
  // the inbox asks the API for anything newer than the newest it holds.
  useEffect(() => {
    if (!profile?.id) return undefined;

    let cursor = null;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { data } = await api.get('/communication/messages', {
          params: { box: 'inbox', ...(cursor ? { since: cursor } : {}) },
        });
        const fresh = data?.messages || [];
        if (fresh.length > 0) {
          cursor = fresh[0].created_at;
          setInbox((prev) => {
            const known = new Set(prev.map((m) => m.id));
            const added = fresh.filter((m) => !known.has(m.id));
            if (added.length === 0) return prev;
            notification.info(added.length === 1 ? 'New message received' : `${added.length} new messages`);
            return [...added, ...prev];
          });
        }
        if (typeof data?.unread === 'number') setUnreadCount(data.unread);
      } catch {
        // Offline or the session expired — the next tick retries.
      }
    };

    realtimeRef.current = setInterval(tick, 30000);
    return () => clearInterval(realtimeRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // ─── Announcement: save ────────────────────────────────────────────
  const handleSaveAnnouncement = async () => {
    if (!annForm.title.trim() || !annForm.content.trim()) {
      notification.error('Title and content are required');
      return;
    }
    setAnnSaving(true);
    try {
      // The server posts the announcement and fans it out to every
      // recipient's notification bell in one transaction.
      const { data } = await api.post('/communication/announcements', {
        title: annForm.title.trim(),
        content: annForm.content.trim(),
        priority: annForm.priority,
        target_audience: annForm.target_audience,
      });
      setAnnouncements((prev) => [data, ...prev]);
      setAnnForm({ title: '', content: '', priority: 'normal', target_audience: 'all' });
      setShowAnnForm(false);
      notification.success('Announcement posted!');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to save announcement');
    } finally {
      setAnnSaving(false);
    }
  };

  // ─── Announcement: delete ──────────────────────────────────────────
  const handleDeleteAnnouncement = async (ann) => {
    const isCreator = ann.created_by === profile.id;
    const isAdmin = profile.role === 'admin' || profile.role === 'super_admin';
    if (!isCreator && !isAdmin) {
      notification.error('You can only delete your own announcements');
      return;
    }
    try {
      await api.delete(`/communication/announcements/${ann.id}`);
      setAnnouncements((prev) => prev.filter((a) => a.id !== ann.id));
      notification.success('Announcement deleted');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete announcement');
    }
  };

  // ─── Message: select + mark read ──────────────────────────────────
  const handleSelectMsg = async (msg) => {
    setSelectedMsg(msg);
    if (!msg.is_read && msgTab === 'inbox') {
      setInbox((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_read: true } : m)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      api.post(`/communication/messages/${msg.id}/read`).catch(() => {});
    }
  };

  // ─── Recipient search ──────────────────────────────────────────────
  const handleRecipientSearch = async (val) => {
    setRecipientSearch(val);
    setSelectedRecipient(null);
    if (!val.trim() || val.length < 2) { setRecipientResults([]); return; }
    try {
      const { data } = await api.get('/communication/recipients', { params: { search: val } });
      setRecipientResults(data || []);
    } catch {
      setRecipientResults([]);
    }
  };

  // ─── Send message ──────────────────────────────────────────────────
  const handleSendMessage = async () => {
    if (!selectedRecipient) { notification.error('Please select a recipient'); return; }
    if (!composeForm.subject.trim()) { notification.error('Subject is required'); return; }
    if (!composeForm.body.trim()) { notification.error('Message body is required'); return; }

    setComposeSaving(true);
    try {
      const { data } = await api.post('/communication/messages', {
        recipient_id: selectedRecipient.id,
        subject: composeForm.subject.trim(),
        body: composeForm.body.trim(),
      });
      setSent((prev) => [data, ...prev]);
      setComposeForm({ subject: '', body: '' });
      setRecipientSearch('');
      setSelectedRecipient(null);
      setRecipientResults([]);
      setShowCompose(false);
      notification.success('Message sent!');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to send message');
    } finally {
      setComposeSaving(false);
    }
  };

  const currentMessages = msgTab === 'inbox' ? inbox : sent;

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold text-white">Communication Center</h1>

        {/* Top-level tabs */}
        <div className="flex gap-2 border-b border-white/10 pb-0">
          {['announcements', 'messages'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition capitalize ${
                activeTab === tab
                  ? 'bg-white/10 text-white border-b-2 border-neon-cyan'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {tab === 'messages' ? (
                <span className="flex items-center gap-1.5">
                  Messages
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">{unreadCount}</span>
                  )}
                </span>
              ) : (
                tab.charAt(0).toUpperCase() + tab.slice(1)
              )}
            </button>
          ))}
        </div>

        {/* ─── ANNOUNCEMENTS TAB ─────────────────────────────────────── */}
        {activeTab === 'announcements' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <MdCampaign className="text-neon-cyan" /> Announcements
              </h2>
              <Button variant="primary" size="sm" onClick={() => setShowAnnForm(!showAnnForm)}>
                <MdAdd className="inline mr-1" /> New Announcement
              </Button>
            </div>

            {showAnnForm && (
              <GlassCard className="p-6">
                <h3 className="text-white font-bold mb-4">Post New Announcement</h3>
                <div className="space-y-3">
                  <Input
                    label="Title"
                    required
                    value={annForm.title}
                    onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Announcement title"
                  />
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">
                      Content <span className="text-red-400 ml-1">*</span>
                    </label>
                    <textarea
                      className="input-glass w-full h-28 resize-none"
                      placeholder="Announcement details..."
                      value={annForm.content}
                      onChange={e => setAnnForm(f => ({ ...f, content: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="mb-4">
                      <label className="block text-sm font-medium mb-2">Priority</label>
                      <select
                        className="input-glass w-full"
                        value={annForm.priority}
                        onChange={e => setAnnForm(f => ({ ...f, priority: e.target.value }))}
                      >
                        <option value="urgent">Urgent</option>
                        <option value="high">High</option>
                        <option value="normal">Normal</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium mb-2">Target Audience</label>
                      <select
                        className="input-glass w-full"
                        value={annForm.target_audience}
                        onChange={e => setAnnForm(f => ({ ...f, target_audience: e.target.value }))}
                      >
                        <option value="all">All</option>
                        <option value="teachers">Teachers</option>
                        <option value="students">Students</option>
                        <option value="parents">Parents</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="primary" loading={annSaving} onClick={handleSaveAnnouncement}>
                      Post Announcement
                    </Button>
                    <Button variant="secondary" onClick={() => setShowAnnForm(false)}>Cancel</Button>
                  </div>
                </div>
              </GlassCard>
            )}

            {annLoading ? (
              <div className="text-center py-12 text-white/50">Loading announcements...</div>
            ) : announcements.length === 0 ? (
              <GlassCard className="p-10 text-center text-white/40">No announcements yet.</GlassCard>
            ) : (
              <div className="space-y-3">
                {announcements.map(ann => {
                  const senderName = ann.user_profiles
                    ? `${ann.user_profiles.first_name} ${ann.user_profiles.last_name}`
                    : 'Unknown';
                  const canDelete = ann.created_by === profile?.id || profile?.role === 'admin' || profile?.role === 'super_admin';
                  return (
                    <GlassCard key={ann.id} className="p-4">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="text-white font-semibold">{ann.title}</h3>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLES[ann.priority] || PRIORITY_STYLES.normal}`}>
                              {ann.priority}
                            </span>
                            <span className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              {ann.target_audience}
                            </span>
                          </div>
                          <p className="text-white/65 text-sm">{ann.content}</p>
                          <p className="text-white/35 text-xs mt-2">
                            By {senderName} &middot; {formatDate(ann.created_at)}
                          </p>
                        </div>
                        {canDelete && (
                          <button
                            onClick={() => handleDeleteAnnouncement(ann)}
                            className="text-red-400/60 hover:text-red-400 transition shrink-0"
                          >
                            <MdDelete className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── MESSAGES TAB ──────────────────────────────────────────── */}
        {activeTab === 'messages' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <button
                  onClick={() => { setMsgTab('inbox'); setSelectedMsg(null); }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    msgTab === 'inbox' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  <MdInbox /> Inbox
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">{unreadCount}</span>
                  )}
                </button>
                <button
                  onClick={() => { setMsgTab('sent'); setSelectedMsg(null); }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    msgTab === 'sent' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  <MdOutbox /> Sent
                </button>
              </div>
              <Button variant="primary" size="sm" onClick={() => setShowCompose(true)}>
                <MdAdd className="inline mr-1" /> Compose
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Message list */}
              <div className="lg:col-span-2 space-y-2">
                {msgLoading ? (
                  <div className="text-center py-8 text-white/50">Loading...</div>
                ) : currentMessages.length === 0 ? (
                  <GlassCard className="p-8 text-center text-white/40">No messages.</GlassCard>
                ) : (
                  currentMessages.map(msg => {
                    const person = msgTab === 'inbox' ? msg.sender : msg.recipient;
                    const personName = person ? `${person.first_name} ${person.last_name}` : 'Unknown';
                    const isSelected = selectedMsg?.id === msg.id;
                    const isUnread = !msg.is_read && msgTab === 'inbox';
                    return (
                      <GlassCard
                        key={msg.id}
                        className={`p-3 cursor-pointer transition ${isSelected ? 'ring-1 ring-neon-cyan/50 bg-white/8' : 'hover:bg-white/5'}`}
                        onClick={() => handleSelectMsg(msg)}
                      >
                        <div className="flex gap-2.5 items-start">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-blue to-neon-cyan flex items-center justify-center text-xs font-bold text-white shrink-0">
                            {getInitials(personName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center gap-1">
                              <span className={`text-sm truncate ${isUnread ? 'text-white font-semibold' : 'text-white/80'}`}>
                                {personName}
                              </span>
                              <span className="text-white/35 text-xs shrink-0">{formatDate(msg.created_at)}</span>
                            </div>
                            <p className={`text-sm truncate ${isUnread ? 'text-white/80' : 'text-white/60'}`}>{msg.subject}</p>
                            <p className="text-white/40 text-xs truncate">{truncateText(msg.body, 60)}</p>
                          </div>
                          {isUnread && <MdCircle className="text-neon-cyan w-2 h-2 shrink-0 mt-1.5" />}
                        </div>
                      </GlassCard>
                    );
                  })
                )}
              </div>

              {/* Message detail */}
              <div className="lg:col-span-3">
                {selectedMsg ? (
                  <GlassCard className="p-6 h-full">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-white font-bold text-lg">{selectedMsg.subject}</h3>
                        <p className="text-white/50 text-sm mt-1">
                          {msgTab === 'inbox'
                            ? `From: ${selectedMsg.sender ? `${selectedMsg.sender.first_name} ${selectedMsg.sender.last_name}` : 'Unknown'}`
                            : `To: ${selectedMsg.recipient ? `${selectedMsg.recipient.first_name} ${selectedMsg.recipient.last_name}` : 'Unknown'}`
                          }
                          {' '}&middot; {formatDate(selectedMsg.created_at)}
                        </p>
                      </div>
                      <button onClick={() => setSelectedMsg(null)} className="text-white/40 hover:text-white/70">
                        <MdClose className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="border-t border-white/10 pt-4">
                      <p className="text-white/85 leading-relaxed whitespace-pre-wrap">{selectedMsg.body}</p>
                    </div>
                  </GlassCard>
                ) : (
                  <GlassCard className="p-10 flex flex-col items-center justify-center h-full text-center text-white/30">
                    <MdMessage className="w-12 h-12 mb-3 opacity-30" />
                    <p>Select a message to read</p>
                  </GlassCard>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── COMPOSE MODAL ─────────────────────────────────────────── */}
        {/* Portalled to <body>: MainLayout's ancestors set `perspective` and
            `will-change: transform` for the 3D shell, which gives fixed-
            position descendants a new containing block instead of the
            viewport — an in-place backdrop here would land off-screen. */}
        {showCompose && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Compose Message</h3>
                <button onClick={() => setShowCompose(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>

              {/* Recipient search */}
              <div className="mb-4 relative">
                <label className="block text-sm font-medium mb-2">
                  Recipient <span className="text-red-400 ml-1">*</span>
                </label>
                {selectedRecipient ? (
                  <div className="flex items-center gap-2 p-2.5 bg-white/5 rounded-lg border border-white/10">
                    <span className="text-white text-sm flex-1">
                      {selectedRecipient.first_name} {selectedRecipient.last_name}
                      <span className="text-white/40 ml-2 text-xs">({selectedRecipient.role})</span>
                    </span>
                    <button onClick={() => { setSelectedRecipient(null); setRecipientSearch(''); }}
                      className="text-white/40 hover:text-white/70">
                      <MdClose className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
                      <input
                        className="input-glass w-full pl-9"
                        placeholder="Search by name..."
                        value={recipientSearch}
                        onChange={e => handleRecipientSearch(e.target.value)}
                      />
                    </div>
                    {recipientResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-gray-900/95 border border-white/10 rounded-lg overflow-hidden shadow-xl">
                        {recipientResults.map(r => (
                          <button
                            key={r.id}
                            className="w-full text-left px-4 py-2.5 hover:bg-white/10 text-sm text-white/80 transition"
                            onClick={() => { setSelectedRecipient(r); setRecipientResults([]); }}
                          >
                            {r.first_name} {r.last_name}
                            <span className="text-white/40 ml-2 text-xs capitalize">({r.role})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <Input
                label="Subject"
                required
                value={composeForm.subject}
                onChange={e => setComposeForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="Message subject"
              />
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Body <span className="text-red-400 ml-1">*</span>
                </label>
                <textarea
                  className="input-glass w-full h-32 resize-none"
                  placeholder="Type your message..."
                  value={composeForm.body}
                  onChange={e => setComposeForm(f => ({ ...f, body: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="primary" loading={composeSaving} onClick={handleSendMessage}>
                  <MdSend className="inline mr-1" /> Send
                </Button>
                <Button variant="secondary" onClick={() => setShowCompose(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}
      </div>
    </MainLayout>
  );
}
