
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  BellOff,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  Clock,
  IndianRupee,
  LogOut,
  RefreshCw,
} from 'lucide-react'
import AppBar, { TabRail } from './AppBar'
import DatePicker from './ui/DatePicker'
import Select from './ui/Select'
import { useConfirm } from './ui/useConfirm'
import './dashboard.css'
import {
  apiRequest,
  isAuthError,
  APPOINTMENT_STATUSES,
  TIME_SLOTS,
  todayString,
  isPastDate,
  formatCurrency,
  formatDate,
  formatDateTime,
  getInitials,
} from './api'
import { showToast } from './toast'

// Smooth scrolling, unless the visitor asked for reduced motion.
function smoothOrInstant() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'
}

// Notifications shown before "Show all" (the list grows the page instead of scrolling inside it).
const NOTES_PREVIEW = 4

const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say']

function slotIndex(time) {
  const index = TIME_SLOTS.indexOf(time)
  return index === -1 ? TIME_SLOTS.length : index
}

// One time format across the app: "8 Nov 2026, 1:41 PM".
function formatStamp(value) {
  return formatDateTime(value).replace(/\b(am|pm)\b/g, part => part.toUpperCase())
}

function validateProfile(form) {
  const errors = {}
  const age = Number(form.age)

  if (form.name.trim().length < 2) errors.name = 'Full name needs at least 2 characters.'
  // Same rule as the server (server/routes/profileRoutes.js).
  const phone = form.phone.trim()
  if (phone !== '' && (phone.length > 20 || !/^[+\d][\d\s-]{6,19}$/.test(phone))) {
    errors.phone = 'Phone number: 7 to 20 digits, spaces or dashes, may start with +.'
  }
  if (form.age !== '' && (!Number.isInteger(age) || age < 0 || age > 120)) {
    errors.age = 'Age must be a whole number from 0 to 120.'
  }

  return errors
}

const PROFILE_FIELD_ORDER = ['name', 'phone', 'age', 'gender']

function profileFormFromUser(user) {
  return {
    name: user?.name || '',
    phone: user?.phone || '',
    age: user?.age ?? '',
    gender: user?.gender || '',
  }
}

export default function PatientDashboard({
  user,
  appointments = [],
  onBack,
  onBookNew,
  onRefresh,
  onCancel,
  onReschedule,
  onUpdateProfile,
  onSessionExpired,
  onLogout,
}) {
  const [profileForm, setProfileForm] = useState(() =>
    profileFormFromUser(user)
  )
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileErrors, setProfileErrors] = useState({})

  const [confirm, confirmDialog] = useConfirm()

  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingNotifications, setLoadingNotifications] = useState(true)
  const [showAllNotes, setShowAllNotes] = useState(false)

  const [statusFilter, setStatusFilter] = useState('All')
  const [editingId, setEditingId] = useState(null)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [bookedTimes, setBookedTimes] = useState([])
  const [checkingSlots, setCheckingSlots] = useState(false)
  const [savingReschedule, setSavingReschedule] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const slotRequestRef = useRef(0)

  // Keep profile fields synchronized when the parent refreshes the user
  // (adjusting state during render, so the form never shows a stale frame).
  const [profileUser, setProfileUser] = useState(user)

  if (profileUser !== user) {
    setProfileUser(user)
    setProfileForm(profileFormFromUser(user))
  }

  // ---------- notifications ----------

  const applyNotifications = useCallback(data => {
    setNotifications(
      Array.isArray(data.notifications) ? data.notifications : []
    )

    setUnreadCount(Number(data.unreadCount) || 0)
  }, [])

  const handleNotificationsError = useCallback(
    requestError => {
      if (isAuthError(requestError)) {
        onSessionExpired?.()
      } else {
        showToast(
          requestError.message || 'Could not load notifications.',
          'error'
        )
      }
    },
    [onSessionExpired]
  )

  const loadNotifications = useCallback(async () => {
    try {
      applyNotifications(await apiRequest('/api/notifications'))
    } catch (requestError) {
      handleNotificationsError(requestError)
    } finally {
      setLoadingNotifications(false)
    }
  }, [applyNotifications, handleNotificationsError])

  // First load: state is only set once the request settles.
  useEffect(() => {
    let active = true

    apiRequest('/api/notifications')
      .then(
        data => {
          if (active) applyNotifications(data)
        },
        requestError => {
          if (active) handleNotificationsError(requestError)
        }
      )
      .finally(() => {
        if (active) setLoadingNotifications(false)
      })

    return () => {
      active = false
    }
  }, [applyNotifications, handleNotificationsError])

  // ---------- profile ----------

  function handleProfileChange(event) {
    const { name, value } = event.target

    setProfileForm(previous => ({
      ...previous,
      [name]: value,
    }))

    setProfileErrors(previous =>
      previous[name] ? { ...previous, [name]: undefined } : previous
    )
  }

  async function handleProfileSubmit(event) {
    event.preventDefault()

    const errors = validateProfile(profileForm)

    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors)
      const first = PROFILE_FIELD_ORDER.find(key => errors[key])
      document.getElementById(`profile-${first}`)?.focus()
      return
    }

    setProfileErrors({})

    setSavingProfile(true)

    try {
      const updated = await onUpdateProfile?.({
        name: profileForm.name.trim(),
        phone: profileForm.phone.trim(),
        age: profileForm.age === '' ? null : Number(profileForm.age),
        gender: profileForm.gender,
      })

      if (updated) {
        setProfileForm(profileFormFromUser(updated))
      }
    } catch (requestError) {
      // App's updatePatientProfile already showed the toast; the server's per-field
      // messages ({ errors: [{ field, message }] }) go under their fields.
      const list = requestError?.data?.errors

      if (Array.isArray(list) && list.length > 0) {
        const fieldErrors = list.reduce((map, item) => {
          if (item?.field && !map[item.field]) map[item.field] = item.message
          return map
        }, {})
        setProfileErrors(fieldErrors)
        const first = PROFILE_FIELD_ORDER.find(key => fieldErrors[key])
        if (first) document.getElementById(`profile-${first}`)?.focus()
      }
    } finally {
      setSavingProfile(false)
    }
  }

  // ---------- notifications actions ----------

  async function markAllRead() {
    try {
      await apiRequest('/api/notifications/read-all', {
        method: 'PUT',
      })

      setNotifications(list =>
        list.map(item => ({
          ...item,
          read: true,
        }))
      )

      setUnreadCount(0)

      showToast('All notifications marked as read.', 'success')
    } catch (requestError) {
      if (isAuthError(requestError)) {
        onSessionExpired?.()
      } else {
        showToast(requestError.message, 'error')
      }
    }
  }

  async function markOneRead(id) {
    try {
      await apiRequest(`/api/notifications/${id}/read`, {
        method: 'PUT',
      })

      setNotifications(list =>
        list.map(item =>
          item.id === id
            ? {
                ...item,
                read: true,
              }
            : item
        )
      )

      setUnreadCount(count => Math.max(0, count - 1))
    } catch (requestError) {
      if (isAuthError(requestError)) {
        onSessionExpired?.()
      } else {
        showToast(requestError.message, 'error')
      }
    }
  }

  async function handleRefresh() {
    setRefreshing(true)

    try {
      await Promise.all([
        Promise.resolve(onRefresh?.()),
        loadNotifications(),
      ])

      showToast('Dashboard updated.', 'info')
    } catch (requestError) {
      showToast(
        requestError.message || 'Could not refresh dashboard.',
        'error'
      )
    } finally {
      setRefreshing(false)
    }
  }

  // ---------- reschedule ----------

  async function loadBookedTimes(appointment, date) {
    const requestId = ++slotRequestRef.current

    setBookedTimes([])
    setCheckingSlots(true)

    try {
      const query = new URLSearchParams({
        doctorId: appointment.doctorId,
        date,
        exclude: appointment.id,
      })

      const data = await apiRequest(
        `/api/appointments/booked?${query.toString()}`
      )

      if (requestId === slotRequestRef.current) {
        setBookedTimes(
          Array.isArray(data.bookedTimes) ? data.bookedTimes : []
        )
      }
    } catch (requestError) {
      if (requestId !== slotRequestRef.current) return

      if (isAuthError(requestError)) {
        onSessionExpired?.()
      } else {
        showToast(
          `Could not check availability. ${requestError.message}`,
          'error'
        )
      }
    } finally {
      if (requestId === slotRequestRef.current) {
        setCheckingSlots(false)
      }
    }
  }

  function startReschedule(appointment) {
    slotRequestRef.current += 1

    setEditingId(appointment.id)
    setNewDate('')
    setNewTime('')
    setBookedTimes([])
    setCheckingSlots(false)

    // The form mounts on the next render: put the keyboard on its first field.
    window.setTimeout(() => {
      document.getElementById(`new-date-${appointment.id}`)?.focus()
    }, 0)
  }

  function closeReschedule() {
    slotRequestRef.current += 1

    // Keyboard focus goes back to the Reschedule button that opened the form.
    const openerId = editingId
    window.setTimeout(() => {
      document.getElementById(`reschedule-${openerId}`)?.focus()
    }, 0)

    setEditingId(null)
    setNewDate('')
    setNewTime('')
    setBookedTimes([])
    setCheckingSlots(false)
  }

  function handleDateChange(appointment, value) {
    setNewDate(value)
    setNewTime('')

    if (value && !isPastDate(value)) {
      loadBookedTimes(appointment, value)
    } else {
      slotRequestRef.current += 1
      setBookedTimes([])
      setCheckingSlots(false)
    }
  }

  async function handleRescheduleSubmit(event, appointment) {
    event.preventDefault()

    if (!newDate || !newTime) {
      showToast('Please select a new date and time.', 'error')
      return
    }

    if (isPastDate(newDate)) {
      showToast('Please select today or a future date.', 'error')
      return
    }

    if (bookedTimes.includes(newTime)) {
      showToast(
        'That time slot is already booked. Please choose another.',
        'error'
      )
      return
    }

    if (
      newDate === appointment.date &&
      newTime === appointment.time
    ) {
      showToast('Please choose a different date or time.', 'error')
      return
    }

    setSavingReschedule(true)

    try {
      const success = await onReschedule?.(
        appointment.id,
        newDate,
        newTime
      )

      if (success) {
        closeReschedule()
        await loadNotifications()
      }
    } catch (requestError) {
      showToast(
        requestError.message || 'Could not reschedule appointment.',
        'error'
      )
    } finally {
      setSavingReschedule(false)
    }
  }

  // ---------- cancellation ----------

  async function handleCancel(appointment) {
    const confirmed = await confirm({
      title: `Cancel your appointment with ${appointment.doctorName}?`,
      description: `${formatDate(appointment.date)} at ${appointment.time}. The clinic is told straight away and the time is freed for other patients.`,
      confirmLabel: 'Cancel appointment',
      cancelLabel: 'Keep it',
      tone: 'danger',
    })

    if (!confirmed) return

    setBusyId(appointment.id)

    try {
      const success = await onCancel?.(appointment.id)

      if (success) {
        await loadNotifications()
      }
    } catch (requestError) {
      showToast(
        requestError.message || 'Could not cancel appointment.',
        'error'
      )
    } finally {
      setBusyId(null)
    }
  }

  // ---------- derived data ----------

  const counts = APPOINTMENT_STATUSES.reduce(
    (accumulator, status) => {
      accumulator[status] = appointments.filter(
        item => item.status === status
      ).length

      return accumulator
    },
    {}
  )

  const today = todayString()

  const upcoming = appointments
    .filter(
      item =>
        (item.status === 'Pending' || item.status === 'Confirmed') &&
        item.date >= today
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        slotIndex(a.time) - slotIndex(b.time)
    )

  const nextAppointment = upcoming[0]

  const visibleAppointments = appointments
    .filter(
      item =>
        statusFilter === 'All' || item.status === statusFilter
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        slotIndex(b.time) - slotIndex(a.time)
    )

  const allSlotsBooked =
    newDate &&
    !checkingSlots &&
    bookedTimes.length >= TIME_SLOTS.length

  // ---------- render ----------

  function scrollToHistory() {
    document
      .getElementById('appointment-history')
      ?.scrollIntoView({
        behavior: smoothOrInstant(),
        block: 'start',
      })
  }

  return (
    <div className="screen dash">
      <AppBar onHome={onBack} label="Patient dashboard">
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={onBack}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span className="appbar__hide-sm">Back to home</span>
        </button>

        {onLogout && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => onLogout()}
          >
            <LogOut size={16} aria-hidden="true" />
            <span className="appbar__hide-sm">Sign out</span>
          </button>
        )}
      </AppBar>

      <main className="screen__main wrap">
        <div className="screen__head dash-head">
          <div className="dash-head__who">
            <span className="avatar avatar--lg" aria-hidden="true">
              {getInitials(user?.name) || 'P'}
            </span>

            <div className="dash-head__text">
              <p className="eyebrow-label">Patient dashboard</p>
              <h1>Welcome back, {user?.name || 'Patient'}</h1>
              {user?.email && <p>{user.email}</p>}
            </div>
          </div>

          <div className="dash-head__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={onBookNew}
            >
              Book an appointment
            </button>

            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw
                size={16}
                className={refreshing ? 'ui-spin' : undefined}
                aria-hidden="true"
              />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {nextAppointment ? (
          <div className="panel-box dash-next">
            <div className="dash-next__body">
              <p className="eyebrow-label">Your next appointment</p>

              <p className="dash-next__title">
                {nextAppointment.doctorName}
              </p>

              <p className="dash-next__when">
                <CalendarClock size={20} aria-hidden="true" />
                {formatDate(nextAppointment.date)} at{' '}
                {nextAppointment.time}
              </p>

              <p className="dash-next__meta">
                {nextAppointment.specialty}
                {nextAppointment.status === 'Pending'
                  ? ' · Waiting for the clinic to confirm'
                  : ''}
              </p>
            </div>

            <div className="dash-next__side">
              <span
                className={`status status-${nextAppointment.status.toLowerCase()}`}
              >
                {nextAppointment.status}
              </span>

              <button
                type="button"
                className="link dash-textbtn"
                onClick={() => {
                  setStatusFilter('All')
                  scrollToHistory()
                }}
              >
                <span>View details</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="panel-box dash-next">
            <div className="dash-next__body">
              <p className="eyebrow-label">Your next appointment</p>
              <p className="dash-next__title">No upcoming appointments</p>
              <p className="dash-next__meta">
                Browse our specialists and book a visit whenever you need one.
              </p>
            </div>

            <div className="dash-next__side">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={onBookNew}
              >
                Find a doctor
              </button>
            </div>
          </div>
        )}

        <div className="dash-stats">
          {[
            ['Total', appointments.length],
            ['Pending', counts.Pending],
            ['Confirmed', counts.Confirmed],
            ['Completed', counts.Completed],
            ['Cancelled', counts.Cancelled],
          ].map(([label, value]) => {
            const filter = label === 'Total' ? 'All' : label

            return (
              <button
                key={label}
                type="button"
                className="dash-stat"
                aria-pressed={statusFilter === filter}
                onClick={() => {
                  setStatusFilter(filter)
                  scrollToHistory()
                }}
              >
                <span className="dash-stat__label">{label}</span>
                <span className="dash-stat__value">{value}</span>
                <span className="dash-stat__hint">View</span>
              </button>
            )
          })}
        </div>

        <div className="dash-cols">
          <div className="dash-col">
            {/* PROFILE */}

            <section className="panel-box panel-box--light dash-panel">
              <div className="dash-panel__head">
                <div>
                  <h2>My profile</h2>
                  <p>Keep your contact details up to date.</p>
                </div>
              </div>

              <form className="form dash-profile" onSubmit={handleProfileSubmit} noValidate>
                <label className="field field--full" htmlFor="profile-name">
                  Full name
                  <input
                    id="profile-name"
                    aria-invalid={Boolean(profileErrors.name)}
                    aria-describedby={profileErrors.name ? 'profile-name-error' : undefined}
                    name="name"
                    value={profileForm.name}
                    onChange={handleProfileChange}
                    placeholder="Your name"
                    required
                  />
                  {profileErrors.name && (
                    <span className="field-error" id="profile-name-error">{profileErrors.name}</span>
                  )}
                </label>

                <label className="field field--full" htmlFor="profile-email">
                  Email address
                  <input
                    id="profile-email"
                    type="email"
                    value={user?.email || ''}
                    readOnly
                  />
                </label>

                <label className="field field--full" htmlFor="profile-phone">
                  Phone number
                  <input
                    id="profile-phone"
                    aria-invalid={Boolean(profileErrors.phone)}
                    aria-describedby={profileErrors.phone ? 'profile-phone-error' : undefined}
                    name="phone"
                    type="tel"
                    value={profileForm.phone}
                    onChange={handleProfileChange}
                    placeholder="+91 98765 43210"
                  />
                  {profileErrors.phone && (
                    <span className="field-error" id="profile-phone-error">{profileErrors.phone}</span>
                  )}
                </label>

                <label className="field" htmlFor="profile-age">
                  Age
                  <input
                    id="profile-age"
                    aria-invalid={Boolean(profileErrors.age)}
                    aria-describedby={profileErrors.age ? 'profile-age-error' : undefined}
                    name="age"
                    type="number"
                    min="0"
                    max="120"
                    value={profileForm.age}
                    onChange={handleProfileChange}
                    placeholder="Optional"
                  />
                  {profileErrors.age && (
                    <span className="field-error" id="profile-age-error">{profileErrors.age}</span>
                  )}
                </label>

                <label className="field" htmlFor="profile-gender">
                  Gender
                  <Select
                    id="profile-gender"
                    name="gender"
                    value={profileForm.gender}
                    onChange={value =>
                      handleProfileChange({ target: { name: 'gender', value } })
                    }
                    options={[
                      { value: '', label: 'Prefer not to say' },
                      ...GENDER_OPTIONS.filter(
                        option => option !== 'Prefer not to say'
                      ).map(option => ({ value: option, label: option })),
                    ]}
                  />
                </label>

                <div className="dash-form-actions">
                  <button
                    type="submit"
                    className="btn btn--secondary"
                    disabled={savingProfile}
                  >
                    {savingProfile ? 'Saving…' : 'Save profile'}
                  </button>
                </div>
              </form>
            </section>

            {/* NOTIFICATIONS */}

            <section className="panel-box panel-box--light dash-panel">
              <div className="dash-panel__head">
                <div>
                  <h2>Notifications</h2>

                  <p>
                    {unreadCount > 0
                      ? `${unreadCount} unread`
                      : 'You are all caught up'}
                  </p>
                </div>

                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={markAllRead}
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              {loadingNotifications ? (
                <div className="dash-skel" aria-busy="true">
                  <span className="sr-only">Loading notifications…</span>
                  {[0, 1, 2].map(row => (
                    <div key={row} className="dash-skel__row" aria-hidden="true">
                      <span className="skel skel--line" style={{ width: '58%' }} />
                      <span className="skel skel--line" />
                      <span className="skel skel--line skel--short" />
                    </div>
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="dash-empty">
                  <BellOff size={20} className="dash-empty__icon" aria-hidden="true" />
                  <h3>No notifications yet</h3>
                  <p>
                    Updates about your appointments will appear here.
                  </p>
                </div>
              ) : (
                <>
                <ul className="dash-notes">
                  {(showAllNotes
                    ? notifications
                    : notifications.slice(0, NOTES_PREVIEW)
                  ).map((notification, index) => (
                    <li
                      key={notification.id}
                      className={[
                        'dash-notice',
                        notification.read ? '' : 'is-unread',
                        index >= NOTES_PREVIEW ? 'is-new' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <div className="dash-notice__head">
                        <strong>
                          {!notification.read && (
                            <span
                              className="dash-notice__dot"
                              aria-label="Unread"
                            />
                          )}

                          {notification.title}
                        </strong>

                        {notification.status && (
                          <span
                            className={`status status-${String(notification.status).toLowerCase()}`}
                          >
                            {notification.status}
                          </span>
                        )}
                      </div>

                      <p>{notification.message}</p>

                      <div className="dash-notice__foot">
                        <time>
                          {formatStamp(notification.createdAt)}
                        </time>

                        {!notification.read && (
                          <button
                            type="button"
                            className="link dash-textbtn"
                            onClick={() =>
                              markOneRead(notification.id)
                            }
                          >
                            <span>Mark read</span>
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                {notifications.length > NOTES_PREVIEW && (
                  <div className="dash-notes__more">
                    <button
                      type="button"
                      className="link dash-textbtn"
                      aria-expanded={showAllNotes}
                      onClick={() => setShowAllNotes(value => !value)}
                    >
                      <span>
                        {showAllNotes
                          ? 'Show fewer'
                          : `Show all ${notifications.length}`}
                      </span>
                    </button>
                  </div>
                )}
                </>
              )}
            </section>
          </div>

          <div className="dash-col">
            {/* APPOINTMENT HISTORY */}

            <section
              className="panel-box panel-box--light dash-panel"
              id="appointment-history"
            >
              <div className="dash-panel__head">
                <div>
                  <h2>My appointments</h2>

                  <p>
                    Showing {visibleAppointments.length} of{' '}
                    {appointments.length}
                  </p>
                </div>
              </div>

              <TabRail
                className="dash-filters"
                label="Filter appointments by status"
              >
                {['All', ...APPOINTMENT_STATUSES].map(filter => (
                  <button
                    key={filter}
                    type="button"
                    role="tab"
                    className="tab"
                    aria-selected={statusFilter === filter}
                    onClick={() => setStatusFilter(filter)}
                  >
                    {filter}
                    {filter !== 'All' ? ` (${counts[filter]})` : ''}
                  </button>
                ))}
              </TabRail>

              {visibleAppointments.length === 0 ? (
                <div className="dash-empty dash-swap" key={`empty-${statusFilter}`}>
                  <CalendarX2 size={20} className="dash-empty__icon" aria-hidden="true" />
                  <h3>
                    {appointments.length === 0
                      ? 'No appointments yet'
                      : `No ${statusFilter.toLowerCase()} appointments`}
                  </h3>

                  <p>
                    {appointments.length === 0
                      ? 'Book your first appointment to see it here.'
                      : 'Try another filter.'}
                  </p>
                </div>
              ) : (
                <ul className="dash-list dash-swap" key={statusFilter}>
                  {visibleAppointments.map(appointment => {
                    const canChange =
                      appointment.status === 'Pending' ||
                      appointment.status === 'Confirmed'

                    const isEditing =
                      editingId === appointment.id

                    const isBusy =
                      busyId === appointment.id

                    return (
                      <li
                        key={appointment.id}
                        className="dash-appt"
                      >
                        <div className="dash-appt__main">
                          <h3>{appointment.doctorName}</h3>

                          <p className="dash-appt__specialty">
                            {appointment.specialty}
                          </p>

                          <dl className="dash-appt__facts">
                            <div>
                              <dt><CalendarDays size={14} aria-hidden="true" />Date</dt>
                              <dd>{formatDate(appointment.date)}</dd>
                            </div>

                            <div>
                              <dt><Clock size={14} aria-hidden="true" />Time</dt>
                              <dd>{appointment.time}</dd>
                            </div>

                            <div>
                              <dt><IndianRupee size={14} aria-hidden="true" />Fee</dt>
                              <dd>{formatCurrency(appointment.fee)}</dd>
                            </div>
                          </dl>

                          {appointment.reason && (
                            <p className="dash-appt__reason">
                              Reason: {appointment.reason}
                            </p>
                          )}
                        </div>

                        <div className="dash-appt__side">
                          <span
                            key={appointment.status}
                            className={`status status-${appointment.status.toLowerCase()}`}
                          >
                            {appointment.status}
                          </span>

                          {canChange && !isEditing && (
                            <div className="dash-appt__actions">
                              <button
                                id={`reschedule-${appointment.id}`}
                                type="button"
                                className="btn btn--secondary btn--sm"
                                onClick={() =>
                                  startReschedule(appointment)
                                }
                                disabled={isBusy}
                              >
                                Reschedule
                              </button>

                              <button
                                type="button"
                                className="btn btn--secondary btn--sm btn--danger"
                                onClick={() =>
                                  handleCancel(appointment)
                                }
                                disabled={isBusy}
                              >
                                {isBusy
                                  ? 'Cancelling…'
                                  : 'Cancel'}
                              </button>
                            </div>
                          )}
                        </div>

                        {isEditing && (
                          <div className="dash-expand">
                          <div className="dash-expand__in">
                          <form
                            className="form dash-reschedule"
                            onSubmit={event =>
                              handleRescheduleSubmit(
                                event,
                                appointment
                              )
                            }
                          >
                            <h4 className="field--full">
                              Reschedule appointment
                            </h4>

                            <label
                              className="field"
                              htmlFor={`new-date-${appointment.id}`}
                            >
                              New date
                              <DatePicker
                                id={`new-date-${appointment.id}`}
                                min={today}
                                value={newDate}
                                onChange={value =>
                                  handleDateChange(appointment, value)
                                }
                              />
                            </label>

                            <label
                              className="field"
                              htmlFor={`new-time-${appointment.id}`}
                            >
                              New time
                              <Select
                                id={`new-time-${appointment.id}`}
                                value={newTime}
                                onChange={setNewTime}
                                disabled={
                                  !newDate ||
                                  checkingSlots ||
                                  allSlotsBooked
                                }
                                placeholder={
                                  !newDate
                                    ? 'Select a date first'
                                    : checkingSlots
                                      ? 'Checking availability…'
                                      : allSlotsBooked
                                        ? 'No slots available'
                                        : 'Select a time'
                                }
                                options={TIME_SLOTS.filter(
                                  slot =>
                                    !(
                                      newDate === appointment.date &&
                                      slot === appointment.time
                                    )
                                ).map(slot => {
                                  const taken = bookedTimes.includes(slot)

                                  return {
                                    value: slot,
                                    label: slot,
                                    disabled: taken,
                                    note: taken ? 'Booked' : undefined,
                                  }
                                })}
                              />
                            </label>

                            {allSlotsBooked && (
                              <p className="form-error" role="alert">
                                All slots are booked on this date.
                                Please pick another day.
                              </p>
                            )}

                            <div className="dash-form-actions">
                              <button
                                type="submit"
                                className="btn btn--secondary btn--sm"
                                disabled={
                                  savingReschedule ||
                                  checkingSlots ||
                                  !newTime
                                }
                              >
                                {savingReschedule
                                  ? 'Saving…'
                                  : 'Save new time'}
                              </button>

                              <button
                                type="button"
                                className="link dash-textbtn"
                                onClick={closeReschedule}
                              >
                                <span>Close</span>
                              </button>
                            </div>
                          </form>
                          </div>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>

      {confirmDialog}
    </div>
  )
}
