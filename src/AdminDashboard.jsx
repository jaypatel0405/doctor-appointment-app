import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  CalendarX2,
  LogOut,
  RefreshCw,
  Search,
  Stethoscope,
  Users,
} from 'lucide-react'
import AppBar, { TabRail } from './AppBar'
import Checkbox from './ui/Checkbox'
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

// Smooth scrolling, unless the visitor asked for reduced motion.
function smoothOrInstant() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'
}

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

function LoadingRows({ label }) {
  return (
    <div className="dash-skel" aria-busy="true">
      <span className="sr-only">{label}</span>
      {[0, 1, 2, 3].map(row => (
        <div key={row} className="dash-skel__row dash-skel__row--table" aria-hidden="true">
          <span className="skel skel--line" />
          <span className="skel skel--line" />
          <span className="skel skel--line skel--short" />
          <span className="skel skel--chip" />
        </div>
      ))}
    </div>
  )
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
    window.scrollTo({ top: 0, behavior: smoothOrInstant() })
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
    ['Doctors', doctors.length, () => setActiveTab('doctors')],
    ['Patients', patients.length, () => setActiveTab('patients')],
    ['Appointments', appointments.length, () => showAppointments('All')],
    ['Pending', counts.Pending, () => showAppointments('Pending')],
    ['Confirmed', counts.Confirmed, () => showAppointments('Confirmed')],
    ['Completed', counts.Completed, () => showAppointments('Completed')],
    ['Cancelled', counts.Cancelled, () => showAppointments('Cancelled')],
  ]

  function showAppointments(filter) {
    setStatusFilter(filter)
    setActiveTab('appointments')
    window.scrollTo({ top: 0, behavior: smoothOrInstant() })
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
            className="btn btn--secondary btn--sm"
            onClick={() => updateStatus(appointment, 'Confirmed')}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Confirm'}
          </button>
        )}

        {appointment.status === 'Confirmed' && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => updateStatus(appointment, 'Completed')}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Complete'}
          </button>
        )}

        <button
          type="button"
          className="btn btn--secondary btn--sm btn--danger"
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
      <div className="dash-table-wrap">
        <table className="dash-table">
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
                <td data-label="Patient">
                  <span className="dash-cell-main">{appointment.patientName}</span>
                  <span className="dash-cell-sub">{appointment.userEmail || '-'}</span>
                </td>
                <td data-label="Doctor">
                  <span className="dash-cell-main">{appointment.doctorName}</span>
                  <span className="dash-cell-sub">{appointment.specialty}</span>
                </td>
                <td data-label="Date" className="dash-num">{formatDate(appointment.date)}</td>
                <td data-label="Time" className="dash-num">{appointment.time}</td>
                <td data-label="Fee" className="dash-num">{formatCurrency(appointment.fee)}</td>
                <td data-label="Status">
                  <StatusBadge key={appointment.status} status={appointment.status} />
                </td>
                <td data-label="Actions">
                  <div className="dash-row-actions">
                    {renderAppointmentActions(appointment)}
                  </div>
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
    <div className="screen dash">
      <AppBar onHome={onBack} label="Staff dashboard">
        <span className="appbar__user">
          {adminUser?.name || 'Admin'}
        </span>

        <button type="button" className="btn btn--secondary btn--sm" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          <span className="appbar__hide-sm">Back to home</span>
        </button>

        <button
          type="button"
          className="link dash-textbtn"
          onClick={() => onLogout(false)}
        >
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
      </AppBar>

      <main className="screen__main wrap">
        <div className="screen__head dash-head">
          <div className="dash-head__who">
            <span className="avatar avatar--lg" aria-hidden="true">
              {getInitials(adminUser?.name || 'Admin') || 'A'}
            </span>

            <div className="dash-head__text">
              <p className="eyebrow-label">Staff dashboard</p>
              <h1>Clinic overview</h1>
              <p>
                Signed in as {adminUser?.name || 'Admin'}
                {adminUser?.email ? ` (${adminUser.email})` : ''}
              </p>
            </div>
          </div>

          <div className="dash-head__actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => loadAll({ silent: true })}
              disabled={loading || refreshing}
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

        {error && (
          <div className="dash-alert" role="alert">
            <div>
              <strong>Could not load dashboard data</strong>
              <p>{error}</p>
            </div>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => loadAll()}
            >
              Try again
            </button>
          </div>
        )}

        <TabRail className="dash-tabs" label="Admin sections">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              className="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
            >
              {label}
              {tabCounts[key] > 0 && (
                <span className="dash-tab-count">{tabCounts[key]}</span>
              )}
            </button>
          ))}
        </TabRail>

        <div className="dash-swap" key={activeTab}>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <>
            <div className="dash-stats">
              {statCards.map(([label, value, onClick]) => (
                <button
                  key={label}
                  type="button"
                  className="dash-stat"
                  onClick={onClick}
                >
                  <span className="dash-stat__label">{label}</span>
                  <span className="dash-stat__value">
                    {loading ? (
                      <>
                        <span className="sr-only">Loading</span>
                        <span className="skel skel--figure" aria-hidden="true" />
                      </>
                    ) : (
                      value
                    )}
                  </span>
                  <span className="dash-stat__hint">Open</span>
                </button>
              ))}
            </div>

            <div className="panel-box panel-box--light dash-panel">
              <div className="dash-panel__head">
                <div>
                  <h2>Recent appointment requests</h2>
                  <p>The latest bookings from patients.</p>
                </div>

                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => showAppointments('All')}
                >
                  View all
                </button>
              </div>

              {loading ? (
                <LoadingRows label="Loading appointments…" />
              ) : appointments.length === 0 ? (
                <div className="dash-empty">
                  <CalendarX2 size={20} className="dash-empty__icon" aria-hidden="true" />
                  <h3>No appointments yet</h3>
                  <p>New requests from patients will show up here.</p>
                </div>
              ) : (
                renderAppointmentsTable(appointments.slice(0, 6))
              )}
            </div>
          </>
        )}

        {/* APPOINTMENTS */}
        {activeTab === 'appointments' && (
          <div className="panel-box panel-box--light dash-panel">
            <div className="dash-panel__head">
              <div>
                <h2>Manage appointments</h2>
                <p>
                  Showing {filteredAppointments.length} of {appointments.length}
                </p>
              </div>
            </div>

            <div className="dash-toolbar">
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

              <div className="field dash-search ui-affix ui-affix--lead">
                <Search size={18} className="ui-affix__lead" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search patient, email or doctor"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  aria-label="Search appointments"
                />
              </div>
            </div>

            {loading ? (
              <LoadingRows label="Loading appointments…" />
            ) : filteredAppointments.length === 0 ? (
              <div className="dash-empty">
                <CalendarX2 size={20} className="dash-empty__icon" aria-hidden="true" />
                <h3>No matching appointments</h3>
                <p>Try a different status filter or search term.</p>
              </div>
            ) : (
              renderAppointmentsTable(filteredAppointments)
            )}
          </div>
        )}

        {/* DOCTORS */}
        {activeTab === 'doctors' && (
          <>
            <div className="panel-box panel-box--light dash-panel">
              <div className="dash-panel__head">
                <div>
                  <h2>{editingDoctor ? `Edit ${editingDoctor.name}` : 'Add a new doctor'}</h2>
                  <p>Doctors you add here appear on the website immediately.</p>
                </div>
              </div>

              <form className="form dash-doctor-form" onSubmit={handleDoctorSubmit}>
                <label className="field" htmlFor="doctor-name">
                  Doctor name
                  <input
                    id="doctor-name"
                    name="name"
                    value={doctorForm.name}
                    onChange={handleDoctorChange}
                    placeholder="Dr. Jane Doe"
                    required
                  />
                </label>

                <label className="field" htmlFor="doctor-specialty">
                  Specialty
                  <input
                    id="doctor-specialty"
                    name="specialty"
                    value={doctorForm.specialty}
                    onChange={handleDoctorChange}
                    placeholder="Cardiologist"
                    required
                  />
                </label>

                <label className="field field--third" htmlFor="doctor-experience">
                  Experience (years)
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
                </label>

                <label className="field field--third" htmlFor="doctor-fee">
                  Consultation fee (₹)
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
                </label>

                <label className="field field--third" htmlFor="doctor-rating">
                  Rating (0 to 5)
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
                </label>

                <label className="field field--full" htmlFor="doctor-bio">
                  Short bio (optional)
                  <textarea
                    id="doctor-bio"
                    name="bio"
                    rows="2"
                    value={doctorForm.bio}
                    onChange={handleDoctorChange}
                    placeholder="One line about the doctor's focus area"
                  />
                </label>

                <Checkbox
                  id="doctor-available"
                  name="available"
                  className="dash-check"
                  checked={doctorForm.available}
                  onChange={checked =>
                    handleDoctorChange({
                      target: { name: 'available', type: 'checkbox', checked },
                    })
                  }
                >
                  Accepting new appointments
                </Checkbox>

                <div className="dash-form-actions">
                  <button type="submit" className="btn btn--primary" disabled={savingDoctor}>
                    {savingDoctor
                      ? 'Saving…'
                      : editingDoctor
                        ? 'Update doctor'
                        : 'Add doctor'}
                  </button>

                  {editingDoctor && (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={resetDoctorForm}
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="panel-box panel-box--light dash-panel">
              <div className="dash-panel__head">
                <div>
                  <h2>Doctor list</h2>
                  <p>{doctors.length} doctors on the team</p>
                </div>
              </div>

              {loading ? (
                <LoadingRows label="Loading doctors…" />
              ) : doctors.length === 0 ? (
                <div className="dash-empty">
                  <Stethoscope size={20} className="dash-empty__icon" aria-hidden="true" />
                  <h3>No doctors yet</h3>
                  <p>Use the form above to add your first doctor.</p>
                </div>
              ) : (
                <div className="dash-table-wrap">
                  <table className="dash-table">
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
                          <td data-label="Doctor">
                            <span className="dash-cell-main">{doctor.name}</span>
                            {doctor.bio && (
                              <span className="dash-cell-sub">{doctor.bio}</span>
                            )}
                          </td>
                          <td data-label="Specialty">{doctor.specialty}</td>
                          <td data-label="Experience" className="dash-num">{doctor.experience} years</td>
                          <td data-label="Fee" className="dash-num">{formatCurrency(doctor.fee)}</td>
                          <td data-label="Rating" className="dash-num">{doctor.rating ? `${doctor.rating} / 5` : '-'}</td>
                          <td data-label="Status">
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
                          <td data-label="Actions">
                            <div className="dash-row-actions">
                              <button
                                type="button"
                                className="btn btn--secondary btn--sm"
                                onClick={() => startEditDoctor(doctor)}
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                className="btn btn--secondary btn--sm btn--danger"
                                onClick={() => deleteDoctor(doctor)}
                                disabled={deletingId === doctor.id}
                              >
                                {deletingId === doctor.id ? 'Deleting…' : 'Delete'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* PATIENTS */}
        {activeTab === 'patients' && (
          <div className="panel-box panel-box--light dash-panel">
            <div className="dash-panel__head">
              <div>
                <h2>Registered patients</h2>
                <p>{patients.length} patients have signed up</p>
              </div>
            </div>

            {loading ? (
              <LoadingRows label="Loading patients…" />
            ) : patients.length === 0 ? (
              <div className="dash-empty">
                <Users size={20} className="dash-empty__icon" aria-hidden="true" />
                <h3>No patients yet</h3>
                <p>Patients appear here once they register on the website.</p>
              </div>
            ) : (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Phone</th>
                      <th>Age / gender</th>
                      <th>Joined</th>
                      <th>Appointments</th>
                      <th>Last appointment</th>
                    </tr>
                  </thead>

                  <tbody>
                    {patients.map(patient => (
                      <tr key={patient.id}>
                        <td data-label="Patient">
                          <span className="dash-cell-main">{patient.name}</span>
                          <span className="dash-cell-sub">{patient.email}</span>
                        </td>
                        <td data-label="Phone" className="dash-num">{patient.phone || <span className="muted">-</span>}</td>
                        <td data-label="Age / gender">
                          {patient.age ?? <span className="muted">-</span>}
                          {patient.gender ? ` / ${patient.gender}` : ''}
                        </td>
                        <td data-label="Joined" className="dash-num">{formatDateTime(patient.joinedAt)}</td>
                        <td data-label="Appointments" className="dash-num">{patient.appointmentCount}</td>
                        <td data-label="Last appointment" className="dash-num">
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
          </div>
        )}
        </div>
      </main>
    </div>
  )
}
