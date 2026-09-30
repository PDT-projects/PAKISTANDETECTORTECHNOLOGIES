import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, X, CheckCircle, XCircle,
  Clock, AlertCircle, Info, BellOff,
  UserPlus, ArrowRight
} from 'lucide-react';
import { AppNotification } from '../modules/transactions/models/types';
import { TransactionFirebaseService } from '../modules/transactions/models/transactionFirebaseService';

type Props = {
  notifications?: AppNotification[];
  setNotifications?: (n: AppNotification[]) => void;
};

const typeIcon = (type: AppNotification['type']) => {
  switch (type) {
    case 'user_registration_pending':
      return <UserPlus size={18} className="text-amber-600 shrink-0" />;
    case 'transaction_pending_approval':
      return <Clock size={18} className="text-amber-500 shrink-0" />;
    case 'transaction_approved':
      return <CheckCircle size={18} className="text-emerald-500 shrink-0" />;
    case 'transaction_rejected':
      return <XCircle size={18} className="text-red-500 shrink-0" />;
    case 'payment_pending':
      return <AlertCircle size={18} className="text-orange-500 shrink-0" />;
    case 'payment_cleared':
      return <CheckCircle size={18} className="text-blue-500 shrink-0" />;
    default:
      return <Info size={18} className="text-gray-500 shrink-0" />;
  }
};

const typeStyles = (
  type: AppNotification['type'],
  isRead: boolean
): { card: string; dot: string } => {
  if (isRead) return { card: 'bg-gray-50 border-gray-200', dot: 'bg-gray-300' };
  switch (type) {
    case 'user_registration_pending':
      return { card: 'bg-amber-50/80 border-amber-300', dot: 'bg-amber-500' };
    case 'transaction_pending_approval':
      return { card: 'bg-amber-50 border-amber-200',     dot: 'bg-amber-400'   };
    case 'transaction_approved':
      return { card: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-400' };
    case 'transaction_rejected':
      return { card: 'bg-red-50 border-red-200',         dot: 'bg-red-400'     };
    case 'payment_pending':
      return { card: 'bg-orange-50 border-orange-200',   dot: 'bg-orange-400'  };
    case 'payment_cleared':
      return { card: 'bg-blue-50 border-blue-200',       dot: 'bg-blue-400'    };
    default:
      return { card: 'bg-gray-50 border-gray-200',       dot: 'bg-gray-300'    };
  }
};

const typeLabel = (
  type: AppNotification['type']
): { text: string; cls: string } => {
  switch (type) {
    case 'user_registration_pending':
      return { text: 'New User', cls: 'bg-amber-100 text-amber-900 font-bold border border-amber-300' };
    case 'transaction_pending_approval':
      return { text: 'Pending',  cls: 'bg-amber-100 text-amber-800'     };
    case 'transaction_approved':
      return { text: 'Approved', cls: 'bg-emerald-100 text-emerald-800' };
    case 'transaction_rejected':
      return { text: 'Rejected', cls: 'bg-red-100 text-red-800'         };
    case 'payment_pending':
      return { text: 'Payment',  cls: 'bg-orange-100 text-orange-800'   };
    case 'payment_cleared':
      return { text: 'Cleared',  cls: 'bg-blue-100 text-blue-800'       };
    default:
      return { text: 'Info',     cls: 'bg-gray-100 text-gray-700'       };
  }
};

import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../api/firebase/firebase';

export function NotificationBell(_props: Props) {
  const navigate = useNavigate();
  const [dbNotifications, setDbNotifications] = useState<AppNotification[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // 1. Subscribe to appNotifications collection
  useEffect(() => {
    const unsub = TransactionFirebaseService.subscribeToNotifications((notifs) => {
      setDbNotifications(notifs);
    });
    return () => unsub();
  }, []);

  // 2. Subscribe to users collection — only status === 'pending' (server-filtered)
  useEffect(() => {
    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), where('status', '==', 'pending')),
      (snap) => {
        const pending = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        setPendingUsers(pending);
      },
      (err) => {
        console.error('Error fetching pending users for bell:', err);
      }
    );
    return () => unsubUsers();
  }, []);

  // Merge appNotifications + live pending users (avoiding duplicates)
  const notifications: AppNotification[] = (() => {
    const list: AppNotification[] = [...dbNotifications];
    const existingUserIds = new Set(
      list.filter(n => n.type === 'user_registration_pending' && n.userId).map(n => n.userId)
    );

    for (const pu of pendingUsers) {
      if (!existingUserIds.has(pu.id)) {
        list.unshift({
          id: `pending_user_${pu.id}`,
          type: 'user_registration_pending',
          title: 'New User Registration',
          message: `${pu.fullName || 'User'} (${pu.email}) has requested access. Approve or reject from User Management.`,
          userId: pu.id,
          userEmail: pu.email,
          userName: pu.fullName,
          isRead: false,
          createdAt: pu.createdAt || new Date().toISOString(),
        });
      }
    }

    return list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  })();

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAsRead = async (id: string) => {
    if (!id.startsWith('pending_user_')) {
      await TransactionFirebaseService.markNotificationRead(id);
    }
  };

  const deleteNotification = async (id: string) => {
    if (!id.startsWith('pending_user_')) {
      await TransactionFirebaseService.deleteNotification(id);
    }
  };

  const markAllAsRead = async () => {
    await TransactionFirebaseService.markAllNotificationsRead();
  };

  const handleNotificationClick = async (notif: AppNotification) => {
    await markAsRead(notif.id);
    if (notif.type === 'user_registration_pending') {
      setIsOpen(false);
      navigate('/user-management');
    }
  };

  const formatTime = (iso: string) => {
    if (!iso) return 'Just now';
    const d      = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins   = Math.floor(diffMs / 60000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return d.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative z-50">

      {/* ── Bell button ──────────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          relative p-3 rounded-full transition-all duration-200
          ${isOpen
            ? 'bg-amber-100 shadow-inner'
            : 'bg-gray-100 hover:bg-amber-50 shadow-neumorph hover:shadow-neumorph-hover'
          }
        `}
      >
        <Bell size={24} className={isOpen ? 'text-amber-600' : 'text-gray-600'} />

        {/* Badge */}
        {unreadCount > 0 && (
          <span style={{
            position:       'absolute',
            top:            '-8px',
            right:          '-8px',
            minWidth:       '24px',
            height:         '24px',
            padding:        '0 5px',
            background:     '#ef4444',
            color:          '#fff',
            fontSize:       '12px',
            fontWeight:     '800',
            borderRadius:   '9999px',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            border:         '2px solid #fff',
            boxShadow:      '0 2px 8px rgba(0,0,0,0.25)',
            lineHeight:     1,
            zIndex:         10,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* ── Dropdown — fixed to right edge, never overflows ──────────────── */}
          <div
            className="fixed z-50 flex flex-col bg-white rounded-2xl overflow-hidden"
            style={{
              top:       '72px',        /* just below topbar */
              right:     '16px',        /* always 16px from right edge */
              width:     '420px',
              maxWidth:  'calc(100vw - 32px)',   /* never wider than screen */
              maxHeight: 'calc(100vh - 96px)',   /* never taller than screen */
              border:    '1px solid #e5e7eb',
              boxShadow: '0 12px 48px rgba(0,0,0,0.18)',
            }}
          >

            {/* Header */}
            <div style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        '16px 20px',
              borderBottom:   '2px solid #e5e7eb',
              background:     '#ffffff',
              flexShrink:     0,
              gap:            '12px',
            }}>
              <div style={{
                display:    'flex',
                alignItems: 'center',
                gap:        '10px',
                minWidth:   0,
              }}>
                <Bell size={20} color="#111827" style={{ flexShrink: 0 }} />
                <span style={{
                  fontSize:   '16px',
                  fontWeight: '700',
                  color:      '#111827',
                  whiteSpace: 'nowrap',
                }}>
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <span style={{
                    background:   '#ef4444',
                    color:        '#fff',
                    fontSize:     '11px',
                    fontWeight:   '700',
                    padding:      '2px 8px',
                    borderRadius: '9999px',
                    whiteSpace:   'nowrap',
                    flexShrink:   0,
                  }}>
                    {unreadCount} new
                  </span>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  style={{
                    fontSize:     '13px',
                    fontWeight:   '600',
                    color:        '#b45309',
                    background:   'none',
                    border:       'none',
                    cursor:       'pointer',
                    whiteSpace:   'nowrap',
                    padding:      '6px 10px',
                    borderRadius: '8px',
                    flexShrink:   0,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fef3c7')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* ── Notification list ─────────────────────────────────────────── */}
            <div style={{
              flex:          1,
              overflowY:     'auto',
              padding:       '12px',
              background:    '#f9fafb',
              display:       'flex',
              flexDirection: 'column',
              gap:           '8px',
            }}>
              {notifications.length === 0 ? (

                /* Empty state */
                <div style={{
                  display:        'flex',
                  flexDirection:  'column',
                  alignItems:     'center',
                  justifyContent: 'center',
                  padding:        '48px 0',
                  gap:            '12px',
                }}>
                  <div style={{
                    width:          '60px',
                    height:         '60px',
                    borderRadius:   '50%',
                    background:     '#e5e7eb',
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                  }}>
                    <BellOff size={28} color="#9ca3af" />
                  </div>
                  <p style={{ fontSize: '14px', fontWeight: '600', margin: 0, color: '#6b7280' }}>
                    You're all caught up!
                  </p>
                  <p style={{ fontSize: '12px', margin: 0, color: '#9ca3af' }}>
                    No notifications yet
                  </p>
                </div>

              ) : (
                notifications.map(notif => {
                  const { card, dot } = typeStyles(notif.type, notif.isRead);
                  const label         = typeLabel(notif.type);
                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`group relative cursor-pointer rounded-xl border
                        transition-all duration-150 hover:shadow-md ${card}
                        ${!notif.isRead ? 'shadow-sm' : ''}
                      `}
                      style={{ padding: '12px 14px', position: 'relative' }}
                    >
                      {/* Left accent bar */}
                      {!notif.isRead && (
                        <div className={dot} style={{
                          position:     'absolute',
                          left:         0,
                          top:          '12px',
                          bottom:       '12px',
                          width:        '4px',
                          borderRadius: '0 4px 4px 0',
                        }} />
                      )}

                      {/* Row: icon + content */}
                      <div style={{
                        display:    'flex',
                        alignItems: 'flex-start',
                        gap:        '10px',
                        paddingLeft: notif.isRead ? '0' : '6px',
                      }}>

                        {/* Icon */}
                        <div style={{ marginTop: '1px', flexShrink: 0 }}>
                          {typeIcon(notif.type)}
                        </div>

                        {/* Text content — takes all remaining width */}
                        <div style={{ flex: 1, minWidth: 0 }}>

                          {/* Title + pill + delete */}
                          <div style={{
                            display:        'flex',
                            alignItems:     'flex-start',
                            justifyContent: 'space-between',
                            gap:            '6px',
                            marginBottom:   '4px',
                          }}>
                            {/* Title + pill */}
                            <div style={{
                              display:    'flex',
                              alignItems: 'center',
                              gap:        '6px',
                              flexWrap:   'wrap',
                              minWidth:   0,
                            }}>
                              <span style={{
                                fontSize:   '13px',
                                fontWeight: '700',
                                color:      '#111827',
                                lineHeight: '1.4',
                                wordBreak:  'break-word',
                              }}>
                                {notif.title}
                              </span>
                              <span className={label.cls} style={{
                                fontSize:      '10px',
                                fontWeight:    '700',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                padding:       '1px 7px',
                                borderRadius:  '9999px',
                                flexShrink:    0,
                              }}>
                                {label.text}
                              </span>
                              {!notif.isRead && (
                                <span className="animate-pulse" style={{
                                  width:        '7px',
                                  height:       '7px',
                                  borderRadius: '50%',
                                  background:   '#f59e0b',
                                  flexShrink:   0,
                                }} />
                              )}
                            </div>

                            {/* Delete */}
                            <button
                              onClick={e => { e.stopPropagation(); deleteNotification(notif.id); }}
                              className="opacity-0 group-hover:opacity-100 transition-all"
                              style={{
                                padding:      '3px',
                                borderRadius: '5px',
                                border:       'none',
                                background:   'none',
                                cursor:       'pointer',
                                color:        '#9ca3af',
                                flexShrink:   0,
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.color      = '#ef4444';
                                e.currentTarget.style.background = '#fef2f2';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.color      = '#9ca3af';
                                e.currentTarget.style.background = 'none';
                              }}
                            >
                              <X size={14} />
                            </button>
                          </div>

                          {/* Message — wraps fully */}
                          <p style={{
                            margin:     '0 0 6px',
                            fontSize:   '12px',
                            color:      '#374151',
                            lineHeight: '1.55',
                            wordBreak:  'break-word',
                            whiteSpace: 'normal',
                          }}>
                            {notif.message}
                          </p>

                          {/* Action CTA for user registration */}
                          {notif.type === 'user_registration_pending' && (
                            <div style={{ marginTop: '6px', marginBottom: '6px' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNotificationClick(notif);
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  background: '#d97706',
                                  color: '#ffffff',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  border: 'none',
                                  cursor: 'pointer',
                                }}
                              >
                                Review in User Management <ArrowRight size={12} />
                              </button>
                            </div>
                          )}

                          {/* Ref chip + timestamp */}
                          <div style={{
                            display:        'flex',
                            alignItems:     'center',
                            justifyContent: 'space-between',
                            gap:            '8px',
                            flexWrap:       'wrap',
                          }}>
                            {notif.transactionRef ? (
                              <span style={{
                                fontFamily:   'monospace',
                                fontSize:     '11px',
                                background:   '#eef2ff',
                                color:        '#4f46e5',
                                padding:      '2px 7px',
                                borderRadius: '5px',
                                fontWeight:   '600',
                                wordBreak:    'break-all',
                              }}>
                                {notif.transactionRef}
                              </span>
                            ) : notif.userEmail ? (
                              <span style={{
                                fontSize:     '11px',
                                background:   '#fef3c7',
                                color:        '#92400e',
                                padding:      '2px 7px',
                                borderRadius: '5px',
                                fontWeight:   '600',
                              }}>
                                {notif.userEmail}
                              </span>
                            ) : <span />}
                            <span style={{
                              fontSize:   '11px',
                              color:      '#9ca3af',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}>
                              {formatTime(notif.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                padding:        '10px 20px',
                borderTop:      '1px solid #e5e7eb',
                background:     '#ffffff',
                flexShrink:     0,
              }}>
                <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
                  {notifications.length} notification{notifications.length !== 1 ? 's' : ''} total
                </p>
                <button
                  onClick={async () => {
                    for (const n of notifications) {
                      await TransactionFirebaseService.deleteNotification(n.id);
                    }
                    setDbNotifications([]);  
                  }}
                  style={{
                    fontSize:     '12px',
                    fontWeight:   '600',
                    color:        '#9ca3af',
                    background:   'none',
                    border:       'none',
                    cursor:       'pointer',
                    padding:      '4px 8px',
                    borderRadius: '6px',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color      = '#ef4444';
                    e.currentTarget.style.background = '#fef2f2';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color      = '#9ca3af';
                    e.currentTarget.style.background = 'none';
                  }}
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}