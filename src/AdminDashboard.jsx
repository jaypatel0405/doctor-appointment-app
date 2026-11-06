import { useCallback, useEffect, useRef, useState } from 'react'
import './dashboard.css'
import {
  apiRequest,
  isAuthError,
  normalizeAppointment,
  APPOINTMENT_STATUSES,
  formatCurrency,
  formatDate,
  formatDateTime,
  getInitials,
} from './api'
import { showToast } from './toast'

const adminRequest = (path, options = {}) =>
  apiRequest(path, { ...options, scope: 'admin' })

const EMPTY_DOCTOR_FORM = {
  name: '',
  specialty: '',
  experience: '',
  fee: '',
  rating: '',
  bio: '',
  available: true,
}

const TABS = [
  ['overview', 'Overview'],
  ['appointments', 'Appointments'],
  ['doctors', 'Doctors'],
  ['patients', 'Patients'],
]

const STATUS_COLORS = {
  Pending: '#e69b19',
  Confirmed: '#16834a',
  Completed: '#087f8c',
  Cancelled: '#dc3545',
}

function StatusBadge({ status }) {
  return (
    <span className={`status status-${String(status).toLowerCase()}`}>
      {status}
    </span>
  )
}

export default function AdminDashboard({ adminUser, onBack, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [appointments, setAppointments] = useState([])
  const [doctors, setDoctors] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState(null)

  const [doctorForm, setDoctorForm] = useState(EMPTY_DOCTOR_FORM)
  const [editingDoctor, setEditingDoctor] = useState(null)
  const [savingDoctor, setSavingDoctor] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  // Keep the latest onLogout without making the data loaders depend on its identity.
  const onLogoutRef = useRef(onLogout)

  useEffect(() => {
    onLogoutRef.current = onLogout
  }, [onLogout])

  const handleRequestError = useCallback((requestError, fallback) => {
    if (isAuthError(requestError)) {
      showToast('Admin session expired. Please log in again.', 'error')
      onLogoutRef.current(true)
      return
    }

    showToast(requestError.message || fallback, 'error')
  }, [])

  const loadAppointments = useCallback(async () => {
    const data = await adminRequest('/api/appointments/admin')
    const list = Array.isArray(data.appointments) ? data.appointments : []
    setAppointments(list.map(normalizeAppointment))
  }, [])

  const loadDoctors = useCallback(async () => {
    const data = await adminRequest('/api/doctors', { auth: false })
    setDoctors(Array.isArray(data.doctors) ? data.doctors : [])
  }, [])

  const loadPatients = useCallback(async () => {
    const data = await adminRequest('/api/admin/patients')
    setPatients(Array.isArray(data.patients) ? data.patients : [])
  }, [])

  const loadAll = useCallback(
    async ({ silent = false, initial = false } = {}) => {
      // `loading` already starts as true, so the first load skips the sync update.
      if (silent) setRefreshing(true)
      else if (!initial) setLoading(true)

      if (!initial) setError('')

      try {
        await Promise.all([loadAppointments(), loadDoctors(), loadPatients()])
      } catch (requestError) {
        if (isAuthError(requestError)) {
          showToast('Admin session expired. Please log in again.', 'error')
          onLogoutRef.current(true)
          return
        }

        setError(requestError.message || 'Could not load dashboard data.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [loadAppointments, loadDoctors, loadPatients]
  )

  // Initial load: state only changes after the requests resolve.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll({ initial: true })
  }, [loadAll])

  // ---------- appointments ----------

  async function updateStatus(appointment, status) {
    const prompts = {
      Completed: 'Mark this appointment as completed?',
      Cancelled: 'Cancel this appointment? The patient will be notified.',
    }

    if (prompts[status] && !window.confirm(prompts[status])) return

    setUpdatingId(appointment.id)

    try {
      await adminRequest(`/api/appointments/${appointment.id}/status`, {
        method: 'PUT',
        body: { status },
      })

      showToast(
        `Appointment for ${appointment.patientName} marked as ${status.toLowerCase()}.`,
        'success'
      )

      await loadAppointments()
    } catch (requestError) {
      handleRequestError(requestError, 'Could not update the appointment.')
    } finally {
      setUpdatingId(null)
    }
  }

  // ---------- doctors ----------

  function handleDoctorChange(event) {
    const { name, value, type, checked } = event.target

    setDoctorForm(previous => ({
      ...previous,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function resetDoctorForm() {
    setDoctorForm(EMPTY_DOCTOR_FORM)
    setEditingDoctor(null)
  }

  function startEditDoctor(doctor) {
    setEditingDoctor(doctor)

    setDoctorForm({
      name: doctor.name || '',
      specialty: doctor.specialty || '',
      experience: doctor.experience ?? '',
      fee: doctor.fee ?? '',
      rating: doctor.rating ?? '',
      bio: doctor.bio || '',
      available: doctor.available !== false,
    })

    setActiveTab('doctors')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDoctorSubmit(event) {
    event.preventDefault()

    if (
      doctorForm.name.trim().length < 2 ||
      doctorForm.specialty.trim().length < 2 ||
      doctorForm.fee === ''
    ) {
      showToast('Please enter the doctor name, specialty and fee.', 'error')
      return
    }

    const payload = {
      name: doctorForm.name.trim(),
      specialty: doctorForm.specialty.trim(),
      experience: doctorForm.experience === '' ? 0 : Number(doctorForm.experience),
      fee: Number(doctorForm.fee),
      rating: doctorForm.rating === '' ? 0 : Number(doctorForm.rating),
      bio: doctorForm.bio.trim(),
      available: Boolean(doctorForm.available),
    }

    setSavingDoctor(true)

    try {
      if (editingDoctor) {
        await adminRequest(`/api/doctors/${editingDoctor.id}`, {
          method: 'PUT',
          body: payload,
        })
        showToast(`${payload.name} updated.`, 'success')
      } else {
        await adminRequest('/api/doctors', { method: 'POST', body: payload })
        showToast(`${payload.name} added to the team.`, 'success')
      }

      resetDoctorForm()
      await Promise.all([loadDoctors(), loadAppointments()])
    } catch (requestError) {
      handleRequestError(requestError, 'Could not save the doctor.')
    } finally {
      setSavingDoctor(false)
    }
  }

  async function deleteDoctor(doctor) {
    if (!window.confirm(`Delete ${doctor.name}? This cannot be undone.`)) return

    setDeletingId(doctor.id)

    try {
      await adminRequest(`/api/doctors/${doctor.id}`, { method: 'DELETE' })
      showToast(`${doctor.name} removed.`, 'success')

      if (editingDoctor && editingDoctor.id === doctor.id) resetDoctorForm()

      await loadDoctors()
    } catch (requestError) {
      handleRequestError(requestError, 'Could not delete the doctor.')
    } finally {
      setDeletingId(null)
    }
  }

  // ---------- derived data ----------

  const counts = APPOINTMENT_STATUSES.reduce((accumulator, status) => {
    accumulator[status] = appointments.filter(item => item.status === status).length
    return accumulator
  }, {})

  const searchTerm = search.trim().toLowerCase()

  const filteredAppointments = appointments.filter(item => {
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter

    const matchesSearch =
      !searchTerm ||
      item.patientName.toLowerCase().includes(searchTerm) ||
      item.userEmail.toLowerCase().includes(searchTerm) ||
      item.doctorName.toLowerCase().includes(searchTerm) ||
      item.specialty.toLowerCase().includes(searchTerm)

    return matchesStatus && matchesSearch
  })

  const statCards = [
    ['Doctors', doctors.length, '#1769aa', () => setActiveTab('doctors')],
    ['Patients', patients.length, '#6b4bd6', () => setActiveTab('patients')],
    ['Appointments', appointments.length, '#64748b', () => showAppointments('All')],
    ['Pending', counts.Pending, STATUS_COLORS.Pending, () => showAppointments('Pending')],
    ['Confirmed', counts.Confirmed, STATUS_COLORS.Confirmed, () => showAppointments('Confirmed')],
    ['Completed', counts.Completed, STATUS_COLORS.Completed, () => showAppointments('Completed')],
    ['Cancelled', counts.Cancelled, STATUS_COLORS.Cancelled, () => showAppointments('Cancelled')],
  ]

  function showAppointments(filter) {
    setStatusFilter(filter)
    setActiveTab('appointments')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const tabCounts = {
    appointments: counts.Pending,
    doctors: doctors.length,
    patients: patients.length,
  }

  // ---------- render helpers ----------

  function renderAppointmentActions(appointment) {
    const busy = updatingId === appointment.id

    if (appointment.status === 'Cancelled' || appointment.status === 'Completed') {
      return <span className="muted">No actions</span>
    }

    return (
      <>
        {appointment.status === 'Pending' && (
          <button
            type="button"
            className="btn btn-success btn-sm"
            onClick={() => updateStatus(appointment, 'Confirmed')}
            disabled={busy}
          >
            {busy ? 'Saving...' : 'Confirm'}
          </button>
        )}

        {appointment.status === 'Confirmed' && (
          <button
            type="button"
            className="btn btn-teal btn-sm"
            onClick={() => updateStatus(appointment, 'Completed')}
            disabled={busy}
          >
            {busy ? 'Saving...' : 'Complete'}
          </button>
        )}

        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={() => updateStatus(appointment, 'Cancelled')}
          disabled={busy}
        >
          Cancel
        </button>
      </>
    )
  }

  function renderAppointmentsTable(rows) {
    return (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Date</th>
              <th>Time</th>
              <th>Fee</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(appointment => (
              <tr key={appointment.id}>
                <td>
                  <span className="cell-primary">{appointment.patientName}</span>
                  <span className="cell-muted">{appointment.userEmail || '-'}</span>
                </td>
                <td>
                  <span className="cell-primary">{appointment.doctorName}</span>
                  <span className="cell-muted">{appointment.specialty}</span>
                </td>
                <td>{formatDate(appointment.date)}</td>
                <td>{appointment.time}</td>
                <td>{formatCurrency(appointment.fee)}</td>
                <td>
                  <StatusBadge status={appointment.status} />
                </td>
                <td className="cell-actions">
                  {renderAppointmentActions(appointment)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ---------- render ----------

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-identity">
          <div className="dashboard-avatar dashboard-avatar-admin">
            {getInitials(adminUser?.name || 'Admin') || 'A'}
          </div>

          <div>
            <h1>Admin Dashboard</h1>
            <p>
              Signed in as {adminUser?.name || 'Admin'}
              {adminUser?.email ? ` (${adminUser.email})` : ''}
            </p>
          </div>
        </div>

        <div className="dashboard-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => loadAll({ silent: true })}
            disabled={loading || refreshing}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <button type="button" className="btn btn-secondary" onClick={onBack}>
            Back to Website
          </button>

          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onLogout(false)}
          >
            Logout
          </button>
        </div>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          <strong>Could not load dashboard data</strong>
          {error}
          <br />
          <button type="button" className="btn btn-sm" onClick={() => loadAll()}>
            Try again
          </button>
        </div>
      )}

      <nav className="dashboard-tabs" aria-label="Admin sections">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={activeTab === key ? 'tab tab-active' : 'tab'}
            onClick={() => setActiveTab(key)}
          >
            {label}
            {tabCounts[key] > 0 && (
              <span className="tab-count">{tabCounts[key]}</span>
            )}
          </button>
        ))}
      </nav>

      {/* OVERVIEW */}
      {activeTab === 'overview' && (
        <>
          <div className="stat-grid">
            {statCards.map(([label, value, color, onClick]) => (
              <button
                key={label}
                type="button"
                className="stat-card"
                style={{ '--stat-color': color }}
                onClick={onClick}
              >
                <span className="stat-label">{label}</span>
                <span className="stat-value">{loading ? '…' : value}</span>
                <span className="stat-hint">Click to view</span>
              </button>
            ))}
          </div>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Recent appointment requests</h2>
                <p className="panel-subtitle">The latest bookings from patients.</p>
              </div>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => showAppointments('All')}
              >
                View all
              </button>
            </div>

            {loading ? (
              <p className="loading-note">Loading appointments...</p>
            ) : appointments.length === 0 ? (
              <div className="empty-note">
                <h3>No appointments yet</h3>
                <p>New requests from patients will show up here.</p>
              </div>
            ) : (
              renderAppointmentsTable(appointments.slice(0, 6))
            )}
          </section>
        </>
      )}

      {/* APPOINTMENTS */}
      {activeTab === 'appointments' && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Manage appointments</h2>
              <p className="panel-subtitle">
                Showing {filteredAppointments.length} of {appointments.length}
              </p>
            </div>
          </div>

          <div className="toolbar">
            <div className="filter-chips">
              {['All', ...APPOINTMENT_STATUSES].map(filter => (
                <button
                  key={filter}
                  type="button"
                  className={statusFilter === filter ? 'chip chip-active' : 'chip'}
                  onClick={() => setStatusFilter(filter)}
                >
                  {filter}
                  {filter !== 'All' ? ` (${counts[filter]})` : ''}
                </button>
              ))}
            </div>

            <input
              type="search"
              className="search-box"
              placeholder="Search patient, email or doctor"
              value={search}
              onChange={event => setSearch(event.target.value)}
              aria-label="Search appointments"
            />
          </div>

          {loading ? (
            <p className="loading-note">Loading appointments...</p>
          ) : filteredAppointments.length === 0 ? (
            <div className="empty-note">
              <h3>No matching appointments</h3>
              <p>Try a different status filter or search term.</p>
            </div>
          ) : (
            renderAppointmentsTable(filteredAppointments)
          )}
        </section>
      )}

      {/* DOCTORS */}
      {activeTab === 'doctors' && (
        <>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>{editingDoctor ? `Edit ${editingDoctor.name}` : 'Add a new doctor'}</h2>
                <p className="panel-subtitle">
                  Doctors you add here appear on the website immediately.
                </p>
              </div>
            </div>

            <form onSubmit={handleDoctorSubmit}>
              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="doctor-name">Doctor name</label>
                  <input
                    id="doctor-name"
                    name="name"
                    value={doctorForm.name}
                    onChange={handleDoctorChange}
                    placeholder="Dr. Jane Doe"
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="doctor-specialty">Specialty</label>
                  <input
                    id="doctor-specialty"
                    name="specialty"
                    value={doctorForm.specialty}
                    onChange={handleDoctorChange}
                    placeholder="Cardiologist"
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="doctor-experience">Experience (years)</label>
                  <input
                    id="doctor-experience"
                    name="experience"
                    type="number"
                    min="0"
                    max="70"
                    value={doctorForm.experience}
                    onChange={handleDoctorChange}
                    placeholder="10"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="doctor-fee">Consultation fee (₹)</label>
                  <input
                    id="doctor-fee"
                    name="fee"
                    type="number"
                    min="0"
                    step="1"
                    value={doctorForm.fee}
                    onChange={handleDoctorChange}
                    placeholder="800"
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="doctor-rating">Rating (0 to 5)</label>
                  <input
                    id="doctor-rating"
                    name="rating"
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={doctorForm.rating}
                    onChange={handleDoctorChange}
                    placeholder="4.8"
                  />
                </div>

                <div className="form-field form-field-full">
                  <label htmlFor="doctor-bio">Short bio (optional)</label>
                  <textarea
                    id="doctor-bio"
                    name="bio"
                    rows="2"
                    value={doctorForm.bio}
                    onChange={handleDoctorChange}
                    placeholder="One line about the doctor's focus area"
                  />
                </div>
              </div>

              <label className="form-check">
                <input
                  type="checkbox"
                  name="available"
                  checked={doctorForm.available}
                  onChange={handleDoctorChange}
                />
                Accepting new appointments
              </label>

              <div className="form-actions">
                <button type="submit" className="btn" disabled={savingDoctor}>
                  {savingDoctor
                    ? 'Saving...'
                    : editingDoctor
                      ? 'Update Doctor'
                      : 'Add Doctor'}
                </button>

                {editingDoctor && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={resetDoctorForm}
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Doctor list</h2>
                <p className="panel-subtitle">{doctors.length} doctors on the team</p>
              </div>
            </div>

            {loading ? (
              <p className="loading-note">Loading doctors...</p>
            ) : doctors.length === 0 ? (
              <div className="empty-note">
                <h3>No doctors yet</h3>
                <p>Use the form above to add your first doctor.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Doctor</th>
                      <th>Specialty</th>
                      <th>Experience</th>
                      <th>Fee</th>
                      <th>Rating</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {doctors.map(doctor => (
                      <tr key={doctor.id}>
                        <td>
                          <span className="cell-primary">{doctor.name}</span>
                          {doctor.bio && (
                            <span className="cell-muted">{doctor.bio}</span>
                          )}
                        </td>
                        <td>{doctor.specialty}</td>
                        <td>{doctor.experience} years</td>
                        <td>{formatCurrency(doctor.fee)}</td>
                        <td>{doctor.rating ? `${doctor.rating} / 5` : '-'}</td>
                        <td>
                          <span
                            className={
                              doctor.available
                                ? 'status status-confirmed'
                                : 'status status-cancelled'
                            }
                          >
                            {doctor.available ? 'Available' : 'Unavailable'}
                          </span>
                        </td>
                        <td className="cell-actions">
                          <button
                            type="button"
                            className="btn btn-warning btn-sm"
                            onClick={() => startEditDoctor(doctor)}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => deleteDoctor(doctor)}
                            disabled={deletingId === doctor.id}
                          >
                            {deletingId === doctor.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* PATIENTS */}
      {activeTab === 'patients' && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Registered patients</h2>
              <p className="panel-subtitle">{patients.length} patients have signed up</p>
            </div>
          </div>

          {loading ? (
            <p className="loading-note">Loading patients...</p>
          ) : patients.length === 0 ? (
            <div className="empty-note">
              <h3>No patients yet</h3>
              <p>Patients appear here once they register on the website.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Phone</th>
                    <th>Age / Gender</th>
                    <th>Joined</th>
                    <th>Appointments</th>
                    <th>Last appointment</th>
                  </tr>
                </thead>

                <tbody>
                  {patients.map(patient => (
                    <tr key={patient.id}>
                      <td>
                        <span className="cell-primary">{patient.name}</span>
                        <span className="cell-muted">{patient.email}</span>
                      </td>
                      <td>{patient.phone || <span className="muted">-</span>}</td>
                      <td>
                        {patient.age ?? <span className="muted">-</span>}
                        {patient.gender ? ` / ${patient.gender}` : ''}
                      </td>
                      <td>{formatDateTime(patient.joinedAt)}</td>
                      <td>{patient.appointmentCount}</td>
                      <td>
                        {patient.lastAppointmentDate
                          ? formatDate(patient.lastAppointmentDate)
                          : <span className="muted">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
