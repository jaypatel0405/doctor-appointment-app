
import { useCallback, useEffect, useRef, useState } from 'react'
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
  getStatusColor,
} from './api'
import { showToast } from './toast'

const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say']

const STATUS_COLORS = {
  Pending: '#e69b19',
  Confirmed: '#16834a',
  Completed: '#087f8c',
  Cancelled: '#dc3545',
}

function slotIndex(time) {
  const index = TIME_SLOTS.indexOf(time)
  return index === -1 ? TIME_SLOTS.length : index
}

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
}) {
  const [profileForm, setProfileForm] = useState(() =>
    profileFormFromUser(user)
  )
  const [savingProfile, setSavingProfile] = useState(false)

  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingNotifications, setLoadingNotifications] = useState(true)

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

  // Keep profile fields synchronized when the parent refreshes the user.
  useEffect(() => {
    setProfileForm(profileFormFromUser(user))
  }, [user])

  // ---------- notifications ----------

  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiRequest('/api/notifications')

      setNotifications(
        Array.isArray(data.notifications) ? data.notifications : []
      )

      setUnreadCount(Number(data.unreadCount) || 0)
    } catch (requestError) {
      if (isAuthError(requestError)) {
        onSessionExpired?.()
      } else {
        showToast(
          requestError.message || 'Could not load notifications.',
          'error'
        )
      }
    } finally {
      setLoadingNotifications(false)
    }
  }, [onSessionExpired])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  // ---------- profile ----------

  function handleProfileChange(event) {
    const { name, value } = event.target

    setProfileForm(previous => ({
      ...previous,
      [name]: value,
    }))
  }

  async function handleProfileSubmit(event) {
    event.preventDefault()

    if (profileForm.name.trim().length < 2) {
      showToast('Please enter your full name.', 'error')
      return
    }

    if (
      profileForm.age !== '' &&
      (!Number.isInteger(Number(profileForm.age)) ||
        Number(profileForm.age) < 0 ||
        Number(profileForm.age) > 120)
    ) {
      showToast('Please enter a valid age between 0 and 120.', 'error')
      return
    }

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
      showToast(
        requestError.message || 'Could not update your profile.',
        'error'
      )
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
  }

  function closeReschedule() {
    slotRequestRef.current += 1

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
    const confirmed = window.confirm(
      `Are you sure you want to cancel your appointment with ${appointment.doctorName}?`
    )

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

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-identity">
          <div className="dashboard-avatar">
            {getInitials(user?.name) || 'P'}
          </div>

          <div>
            <h1>Patient Dashboard</h1>
            <p>
              Welcome back, {user?.name || 'Patient'}
              {user?.email ? ` (${user.email})` : ''}
            </p>
          </div>
        </div>

        <div className="dashboard-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            type="button"
            className="btn"
            onClick={onBookNew}
          >
            Book Appointment
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onBack}
          >
            Back to Website
          </button>
        </div>
      </header>

      {nextAppointment ? (
        <div className="next-appointment">
          <div>
            <h3>Your next appointment</h3>

            <p>
              {nextAppointment.doctorName} ·{' '}
              {formatDate(nextAppointment.date)} at{' '}
              {nextAppointment.time}

              <small>
                {nextAppointment.specialty} · Status:{' '}
                {nextAppointment.status}

                {nextAppointment.status === 'Pending'
                  ? ' (waiting for clinic confirmation)'
                  : ''}
              </small>
            </p>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setStatusFilter('All')

              document
                .getElementById('appointment-history')
                ?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                })
            }}
          >
            View details
          </button>
        </div>
      ) : (
        <div className="alert alert-info">
          <strong>No upcoming appointments</strong>
          Browse our specialists and book a visit whenever you need one.
          <br />

          <button
            type="button"
            className="btn btn-sm"
            onClick={onBookNew}
          >
            Find a doctor
          </button>
        </div>
      )}

      <div className="stat-grid">
        {[
          ['Total', appointments.length, '#1769aa'],
          ['Pending', counts.Pending, STATUS_COLORS.Pending],
          ['Confirmed', counts.Confirmed, STATUS_COLORS.Confirmed],
          ['Completed', counts.Completed, STATUS_COLORS.Completed],
          ['Cancelled', counts.Cancelled, STATUS_COLORS.Cancelled],
        ].map(([label, value, color]) => (
          <button
            key={label}
            type="button"
            className="stat-card"
            style={{ '--stat-color': color }}
            onClick={() => {
              setStatusFilter(label === 'Total' ? 'All' : label)

              document
                .getElementById('appointment-history')
                ?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                })
            }}
          >
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
            <span className="stat-hint">Click to filter</span>
          </button>
        ))}
      </div>

      <div className="dashboard-columns">
        <div>
          {/* PROFILE */}

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>My profile</h2>
                <p className="panel-subtitle">
                  Keep your contact details up to date.
                </p>
              </div>
            </div>

            <form onSubmit={handleProfileSubmit}>
              <div className="form-field">
                <label htmlFor="profile-name">Full name</label>

                <input
                  id="profile-name"
                  name="name"
                  value={profileForm.name}
                  onChange={handleProfileChange}
                  placeholder="Your name"
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="profile-email">Email address</label>

                <input
                  id="profile-email"
                  type="email"
                  value={user?.email || ''}
                  readOnly
                />
              </div>

              <div className="form-field">
                <label htmlFor="profile-phone">Phone number</label>

                <input
                  id="profile-phone"
                  name="phone"
                  type="tel"
                  value={profileForm.phone}
                  onChange={handleProfileChange}
                  placeholder="+91 98765 43210"
                />
              </div>

              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="profile-age">Age</label>

                  <input
                    id="profile-age"
                    name="age"
                    type="number"
                    min="0"
                    max="120"
                    value={profileForm.age}
                    onChange={handleProfileChange}
                    placeholder="Optional"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="profile-gender">Gender</label>

                  <select
                    id="profile-gender"
                    name="gender"
                    value={profileForm.gender}
                    onChange={handleProfileChange}
                  >
                    <option value="">Prefer not to say</option>

                    {GENDER_OPTIONS
                      .filter(
                        option => option !== 'Prefer not to say'
                      )
                      .map(option => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="btn"
                disabled={savingProfile}
              >
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
          </section>

          {/* NOTIFICATIONS */}

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Notifications</h2>

                <p className="panel-subtitle">
                  {unreadCount > 0
                    ? `${unreadCount} unread`
                    : 'You are all caught up'}
                </p>
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={markAllRead}
                >
                  Mark all as read
                </button>
              )}
            </div>

            {loadingNotifications ? (
              <p className="loading-note">
                Loading notifications...
              </p>
            ) : notifications.length === 0 ? (
              <div className="empty-note">
                <h3>No notifications yet</h3>
                <p>
                  Updates about your appointments will appear here.
                </p>
              </div>
            ) : (
              <div className="notification-list">
                {notifications.map(notification => (
                  <article
                    key={notification.id}
                    className={
                      notification.read
                        ? 'notification-card'
                        : 'notification-card notification-unread'
                    }
                    style={{
                      '--status-color': getStatusColor(
                        notification.status
                      ),
                    }}
                  >
                    <header>
                      <strong>
                        {!notification.read && (
                          <span className="unread-dot" />
                        )}

                        {notification.title}
                      </strong>

                      {!notification.read && (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() =>
                            markOneRead(notification.id)
                          }
                        >
                          Mark read
                        </button>
                      )}
                    </header>

                    <p>{notification.message}</p>

                    <small>
                      {formatDateTime(notification.createdAt)}
                    </small>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <div>
          {/* APPOINTMENT HISTORY */}

          <section
            className="panel"
            id="appointment-history"
          >
            <div className="panel-header">
              <div>
                <h2>My appointments</h2>

                <p className="panel-subtitle">
                  Showing {visibleAppointments.length} of{' '}
                  {appointments.length}
                </p>
              </div>

              <div className="filter-chips">
                {['All', ...APPOINTMENT_STATUSES].map(filter => (
                  <button
                    key={filter}
                    type="button"
                    className={
                      statusFilter === filter
                        ? 'chip chip-active'
                        : 'chip'
                    }
                    onClick={() => setStatusFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {visibleAppointments.length === 0 ? (
              <div className="empty-note">
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
              <div className="history-list">
                {visibleAppointments.map(appointment => {
                  const canChange =
                    appointment.status === 'Pending' ||
                    appointment.status === 'Confirmed'

                  const isEditing =
                    editingId === appointment.id

                  const isBusy =
                    busyId === appointment.id

                  return (
                    <article
                      key={appointment.id}
                      className="history-card"
                    >
                      <div>
                        <h3>{appointment.doctorName}</h3>

                        <p className="specialty">
                          {appointment.specialty}
                        </p>

                        <div className="history-meta">
                          <span>
                            <strong>Date:</strong>{' '}
                            {formatDate(appointment.date)}
                          </span>

                          <span>
                            <strong>Time:</strong>{' '}
                            {appointment.time}
                          </span>

                          <span>
                            <strong>Fee:</strong>{' '}
                            {formatCurrency(appointment.fee)}
                          </span>
                        </div>

                        {appointment.reason && (
                          <p className="history-reason">
                            Reason: {appointment.reason}
                          </p>
                        )}
                      </div>

                      <div className="history-side">
                        <span
                          className={`status status-${appointment.status.toLowerCase()}`}
                        >
                          {appointment.status}
                        </span>

                        {canChange && !isEditing && (
                          <>
                            <button
                              type="button"
                              className="btn btn-warning btn-sm"
                              onClick={() =>
                                startReschedule(appointment)
                              }
                              disabled={isBusy}
                            >
                              Reschedule
                            </button>

                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() =>
                                handleCancel(appointment)
                              }
                              disabled={isBusy}
                            >
                              {isBusy
                                ? 'Cancelling...'
                                : 'Cancel'}
                            </button>
                          </>
                        )}
                      </div>

                      {isEditing && (
                        <form
                          className="inline-form"
                          onSubmit={event =>
                            handleRescheduleSubmit(
                              event,
                              appointment
                            )
                          }
                        >
                          <h4>Reschedule appointment</h4>

                          <div className="form-grid">
                            <div className="form-field">
                              <label
                                htmlFor={`new-date-${appointment.id}`}
                              >
                                New date
                              </label>

                              <input
                                id={`new-date-${appointment.id}`}
                                type="date"
                                min={today}
                                value={newDate}
                                onChange={event =>
                                  handleDateChange(
                                    appointment,
                                    event.target.value
                                  )
                                }
                                required
                              />
                            </div>

                            <div className="form-field">
                              <label
                                htmlFor={`new-time-${appointment.id}`}
                              >
                                New time
                              </label>

                              <select
                                id={`new-time-${appointment.id}`}
                                value={newTime}
                                onChange={event =>
                                  setNewTime(event.target.value)
                                }
                                disabled={
                                  !newDate ||
                                  checkingSlots ||
                                  allSlotsBooked
                                }
                                required
                              >
                                <option value="">
                                  {!newDate
                                    ? 'Select a date first'
                                    : checkingSlots
                                      ? 'Checking availability...'
                                      : allSlotsBooked
                                        ? 'No slots available'
                                        : 'Select a time'}
                                </option>

                                {TIME_SLOTS.map(slot => {
                                  const taken =
                                    bookedTimes.includes(slot)

                                  return (
                                    <option
                                      key={slot}
                                      value={slot}
                                      disabled={taken}
                                    >
                                      {slot}
                                      {taken ? ' - Booked' : ''}
                                    </option>
                                  )
                                })}
                              </select>
                            </div>
                          </div>

                          {allSlotsBooked && (
                            <p className="field-error">
                              All slots are booked on this date.
                              Please pick another day.
                            </p>
                          )}

                          <div className="form-actions">
                            <button
                              type="submit"
                              className="btn btn-sm"
                              disabled={
                                savingReschedule ||
                                checkingSlots ||
                                !newTime
                              }
                            >
                              {savingReschedule
                                ? 'Saving...'
                                : 'Save new schedule'}
                            </button>

                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={closeReschedule}
                            >
                              Close
                            </button>
                          </div>
                        </form>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
