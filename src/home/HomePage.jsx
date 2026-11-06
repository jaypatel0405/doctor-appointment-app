/*
  type: software (MediBook+ is the patients' booking app)
  deal: hero centred, nav centre (nav-cards dealt, no photographs: dealt again to nav-centre),
        close type, footer dark, rhythm surface-pairs, buttons pill (the centred hero's look), mark dots,
        palette green-mat-chocolate, type Host Grotesk, lit ground sky
  effect: grain-gradient behind the hero window
  moment: pinned-chapters in #how
  screens: hero 1, doctors 1 (the live app frame), how 2 (the moment), dashboard 1 on the surface
           ground, faq 1, footer.closing 1
*/
import { memo, useMemo, useRef, useState } from "react";
import { Award, IndianRupee, Search, Star, UserRound, X } from "lucide-react";

import { TIME_SLOTS } from "../api";
import { initials, stepsMarkup } from "./kitMarkup";
import useScrollMotion from "./useScrollMotion";
import useSmoothScroll, { scrollToTarget } from "./useSmoothScroll";
import useTasteKit from "./useTasteKit";
import "./home.css";

const ARROW = (
  <svg className="m-arrow" viewBox="0 0 12 12" aria-hidden="true">
    <path className="m-arrow__stem" d="M1 6h8" />
    <path className="m-arrow__head" d="M4.5 2.5 8 6l-3.5 3.5" />
  </svg>
);

const MAIN_ACTION = "Book an appointment";

// one line-icon weight across the page: the kit's .ui-icon (16px, stroke 1.5)
const ICON = { className: "ui-icon", strokeWidth: 1.5, "aria-hidden": true };

const rupees = (fee) => `₹${Number(fee).toLocaleString("en-IN")}`;

const TONES = ["1", "2", "3", "4", "5"];

const toneFor = (index) => TONES[index % TONES.length];

function feeRange(doctors) {
  const fees = doctors.map((d) => d.fee).filter((fee) => fee > 0);

  if (!fees.length) return null;

  return { min: Math.min(...fees), max: Math.max(...fees) };
}

function scrollToId(id) {
  scrollToTarget(document.getElementById(id));
}

function Logo() {
  return (
    <>
      <span className="mark" data-mark="dots" aria-hidden="true" />
      MediBook+
    </>
  );
}

// ------------------------------------------------------------------ hero window
// The hero's one timed loop (layout.js [data-ly-steps]): the finished picture first, then a slot is
// picked, the request goes out as pending and the clinic confirms it; it holds and plays again.

function HeroWindow({ doctors }) {
  const list = doctors.slice(0, 4);
  const open = list.find((d) => /cardio/i.test(d.specialty)) || list[0];
  const time = TIME_SLOTS[1] || TIME_SLOTS[0];

  return (
    <div
      className="hero__window"
      data-ui-pause-host
      data-fx="grain-gradient"
      data-fx-seed="7"
      role="img"
      aria-label={
        open
          ? `MediBook+ booking ${open.name} for ${time}`
          : "MediBook+ booking a doctor's appointment"
      }
    >
      <div className="ly-piece ui ui-booking bk-win" data-visual aria-hidden="true">
        <div className="bk-win__bar">
          <span className="ui-dots">
            <i />
            <i />
            <i />
          </span>
          <span>
            <b>Find a doctor</b> · {doctors.length || "All"} specialists
          </span>
          <span className="bk-sp" />
          <span>Patient account</span>
        </div>

        <div className="bk-win__body">
          <div className="bk-list">
            <div className="bk-q">Search doctors or fields</div>

            {list.length
              ? list.map((d, i) => (
                  <div
                    key={d.id}
                    className={d === open ? "bk-row is-on" : "bk-row"}
                  >
                    <span className="ui-avatar" data-tone={toneFor(i)}>
                      {initials(d.name)}
                    </span>
                    <b>{d.name}</b>
                    <time>{rupees(d.fee)}</time>
                    <span>{d.specialty}</span>
                  </div>
                ))
              : [0, 1, 2, 3].map((i) => (
                  <div key={i} className="bk-row bk-row--skel">
                    <span className="ui-avatar" data-tone={toneFor(i)} />
                    <b />
                    <span />
                  </div>
                ))}
          </div>

          <div className="bk-open">
            {open && (
              <div className="bk-steps" data-ly-steps="800" data-ly-hold="1500">
                <div className="bk-doc">
                  <span className="ui-avatar ui-avatar--md" data-tone="3">
                    {initials(open.name)}
                  </span>
                  <div>
                    <b>{open.name}</b>
                    <span>
                      {open.specialty} · {open.experience} years ·{" "}
                      {rupees(open.fee)}
                    </span>
                  </div>
                </div>

                <div className="bk-slots">
                  {TIME_SLOTS.slice(0, 6).map((slot) => (
                    <span key={slot}>
                      {slot}
                      {slot === time && (
                        <i className="bk-pick" data-step>
                          {slot}
                        </i>
                      )}
                    </span>
                  ))}
                </div>

                <ul className="bk-status">
                  <li data-step>
                    <span className="st-chip is-wait">Pending</span>
                    <span className="bk-status__t">Request sent for {time}</span>
                    <time>2m</time>
                  </li>
                  <li data-step>
                    <span className="st-chip is-ok">Confirmed</span>
                    <span className="bk-status__t">Clinic confirmed your visit</span>
                    <time>now</time>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the live finder (app frame)
// One app window: the search and the field chips across its top, every doctor in the list (no inner
// scrolling; past LIMIT a "Show all" row), the open doctor beside it. On a phone the open doctor's
// details open inside its row instead. Picking a doctor or a field crossfades what changed: a swap
// the visitor makes, never a scroll effect.

const LIMIT = 7;

function DoctorFacts({ doctor }) {
  return (
    <dl className="fd-facts">
      <div>
        <dt>
          <IndianRupee {...ICON} />
          Consultation
        </dt>
        <dd>{rupees(doctor.fee)}</dd>
      </div>
      <div>
        <dt>
          <Award {...ICON} />
          Experience
        </dt>
        <dd>{doctor.experience} years</dd>
      </div>
      <div>
        <dt>
          <Star {...ICON} />
          Rating
        </dt>
        <dd>{doctor.rating} of 5</dd>
      </div>
    </dl>
  );
}

function DoctorFinder({ doctors, loading, onBook }) {
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("All");
  const [openId, setOpenId] = useState(null);
  const [picked, setPicked] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const searchRef = useRef(null);

  const specialties = useMemo(() => {
    const seen = new Map();

    doctors.forEach((d) => {
      const key = d.specialty.toLowerCase();
      if (!seen.has(key)) seen.set(key, d.specialty);
    });

    return ["All", ...seen.values()];
  }, [doctors]);

  const results = doctors.filter((d) => {
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      d.name.toLowerCase().includes(q) ||
      d.specialty.toLowerCase().includes(q);
    const matchesSpecialty =
      specialty === "All" ||
      d.specialty.toLowerCase() === specialty.toLowerCase();

    return matchesQuery && matchesSpecialty;
  });

  const open = results.find((d) => d.id === openId) || results[0] || null;
  const shown = showAll ? results : results.slice(0, LIMIT);

  function choose(id) {
    setOpenId(id);
    setPicked(true);
  }

  function filter(item) {
    setSpecialty(item);
    setPicked(true);
  }

  function reset() {
    setQuery("");
    setSpecialty("All");
  }

  return (
    <div className="ui ui-app app fill">
      <div className="app__bar">
        <div className={query ? "fd-search has-text" : "fd-search"}>
          <Search {...ICON} />
          <input
            ref={searchRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck="false"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) setQuery("");
            }}
            placeholder="Search by name or field"
            aria-label="Search doctors by name or field"
          />
          <button
            type="button"
            className="fd-clear"
            aria-label="Clear the search"
            tabIndex={query ? 0 : -1}
            aria-hidden={!query}
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
          >
            <X {...ICON} />
          </button>
        </div>

        <div className="fd-chips" role="group" aria-label="Filter by field">
          {specialties.map((item) => (
            <button
              key={item}
              type="button"
              className={item === specialty ? "fd-chip is-on" : "fd-chip"}
              aria-pressed={item === specialty}
              onClick={() => filter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="app__pane app__pane--list">
        <p className="fd-count" aria-live="polite">
          {loading
            ? "Loading doctors"
            : `${results.length} doctor${results.length === 1 ? "" : "s"}`}
        </p>

        <ul
          className={picked ? "fd-rows is-swap" : "fd-rows"}
          key={`${specialty}|${query.trim().toLowerCase()}`}
        >
          {shown.map((d, i) => {
            const isOpen = open?.id === d.id;

            return (
              <li key={d.id} className={isOpen ? "is-open" : undefined}>
                <button
                  type="button"
                  className={isOpen ? "fd-row is-on" : "fd-row"}
                  aria-current={isOpen ? "true" : undefined}
                  aria-expanded={isOpen}
                  onClick={() => choose(d.id)}
                >
                  <span className="ui-avatar ui-avatar--md" data-tone={toneFor(i)}>
                    {initials(d.name)}
                  </span>
                  <span className="fd-row__who">{d.name}</span>
                  <span className="fd-row__sub">{d.specialty}</span>
                  <span className="fd-row__fee">{rupees(d.fee)}</span>
                </button>

                {isOpen && (
                  <div className={picked ? "fd-more is-swap" : "fd-more"}>
                    <DoctorFacts doctor={d} />
                    {d.bio && <p className="fd-bio">{d.bio}</p>}
                    <div className="fd-slots">
                      <p className="fd-slots__label">Consulting hours, every day</p>
                      <div className="fd-slots__row">
                        {TIME_SLOTS.map((slot) => (
                          <span key={slot}>{slot}</span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn--primary fd-book"
                      onClick={() => onBook(d)}
                    >
                      {MAIN_ACTION}
                      {ARROW}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {results.length > shown.length && (
          <button
            type="button"
            className="fd-all"
            onClick={() => setShowAll(true)}
          >
            Show all {results.length} doctors
          </button>
        )}

        {!loading && !results.length && (
          <div className="fd-empty">
            {doctors.length ? (
              <>
                <p>No doctor matches “{query || specialty}”.</p>
                <button type="button" className="link" onClick={reset}>
                  Show all doctors
                  {ARROW}
                </button>
              </>
            ) : (
              <p>The doctor list could not be loaded. Please try again in a moment.</p>
            )}
          </div>
        )}
      </div>

      <div className="app__pane app__pane--open">
        {open ? (
          <article
            key={open.id}
            className={picked ? "fd-open is-swap" : "fd-open"}
            aria-live="polite"
          >
            <header className="fd-open__head">
              <span className="ui-avatar fd-open__av" data-tone="3">
                {initials(open.name)}
              </span>
              <div>
                <p className="fd-open__name">{open.name}</p>
                <p className="fd-open__sub">{open.specialty}</p>
              </div>
              <span className="ui-chip ui-chip--accent">Taking bookings</span>
            </header>

            <DoctorFacts doctor={open} />

            {open.bio && <p className="fd-bio">{open.bio}</p>}

            <div className="fd-slots">
              <p className="fd-slots__label">Consulting hours, every day</p>
              <div className="fd-slots__row">
                {TIME_SLOTS.map((slot) => (
                  <span key={slot}>{slot}</span>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn btn--primary fd-book"
              onClick={() => onBook(open)}
            >
              {MAIN_ACTION}
              {ARROW}
            </button>
          </article>
        ) : (
          <div className="fd-open fd-open--empty">
            <p>
              {loading
                ? "Loading the specialists…"
                : "Pick a doctor from the list to see fees and hours."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ dashboard preview

const STATES = [
  ["Confirmed", "is-ok"],
  ["Pending", "is-wait"],
  ["Completed", "is-done"],
  ["Pending", "is-wait"],
  ["Cancelled", "is-off"],
  ["Completed", "is-done"],
  ["Confirmed", "is-ok"],
];
const DAYS = ["Tomorrow", "Thu", "Last week", "Mon", "Last month", "Sep 12", "Next week"];

function DashboardWindow({ doctors }) {
  const picks = doctors.slice(0, 7);

  return (
    <div className="ui ui-dash bk-win dash-win" aria-hidden="true">
      <div className="bk-win__bar">
        <span className="ui-dots">
          <i />
          <i />
          <i />
        </span>
        <span>
          <b>My appointments</b>
        </span>
        <span className="bk-sp" />
        <span>{picks.length} visits</span>
      </div>
      <div className="dash-win__cols">
        <span>Doctor</span>
        <span className="dash-win__when">When</span>
        <span>Status</span>
      </div>
      <ul className="dash-win__rows">
        {picks.map((d, i) => {
          const when = `${DAYS[i % DAYS.length]}, ${TIME_SLOTS[i % TIME_SLOTS.length]}`;
          const [label, tone] = STATES[i % STATES.length];

          return (
            <li key={d.id}>
              <span className="ui-avatar" data-tone={toneFor(i)}>
                {initials(d.name)}
              </span>
              <span className="dash-win__who">
                <b>{d.name}</b>
                <small>
                  <span className="dash-win__spec">{d.specialty}</span>
                  <span className="dash-win__sub-when">{when}</span>
                </small>
              </span>
              <span className="dash-win__when">{when}</span>
              <span className={`st-chip ${tone}`}>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// rendered once; the pinned-chapters moment and the fragments own these nodes afterwards
const HowSection = memo(
  function HowSection({ markup }) {
    return (
      <section
        className="section"
        id="how"
        style={{ "--h": 2 }}
        data-moment="pinned-chapters"
        aria-labelledby="how-h"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    );
  },
  () => true
);

// ------------------------------------------------------------------ page

export default function HomePage({
  user,
  doctors,
  loadingDoctors,
  onBook,
  onLogin,
  onRegister,
  onLogout,
  onDashboard,
  onAdmin,
}) {
  const mainRef = useRef(null);


  const range = feeRange(doctors);
  const fromFee = range ? rupees(range.min) : null;
  const count = doctors.length;
  const fields = new Set(doctors.map((d) => d.specialty.toLowerCase())).size;

  // the steps' fragments are drawn from the first real doctors; until they load the section
  // waits, so the kit never mounts on placeholder rows
  const [stepsHtml, setStepsHtml] = useState(null);

  if (!stepsHtml && doctors.length) {
    setStepsHtml(stepsMarkup(doctors, TIME_SLOTS));
  }

  const kitReady = !loadingDoctors && (stepsHtml !== null || !doctors.length);

  useTasteKit(mainRef, kitReady);
  useSmoothScroll();
  useScrollMotion(mainRef, kitReady);

  // an action in the phone sheet closes the sheet first (system.js closes it for links only), so the
  // page it leads to, or the signed-out page, is never left under a locked sheet
  function sheet(action) {
    return (event) => {
      const nav = event.currentTarget.closest(".nav");
      if (nav?.classList.contains("is-open")) nav.querySelector(".nav__toggle")?.click();
      action?.(event);
    };
  }

  function go(id) {
    return (event) => {
      event.preventDefault();
      scrollToId(id);
    };
  }

  return (
    <div className="home">
      <header className="nav nav--centre">
        <div className="wrap nav__bar">
          <a className="nav__logo" href="#top" onClick={go("top")}>
            <Logo />
          </a>

          <nav className="nav__links" aria-label="Main" data-lenis-prevent>
            <div className="nav__item">
              <a className="nav__link" href="#doctors">Doctors</a>
            </div>
            <div className="nav__item">
              <a className="nav__link" href="#how">Booking</a>
            </div>
            <div className="nav__item">
              <a className="nav__link" href="#dashboard">Visits</a>
            </div>
            <div className="nav__item">
              <a className="nav__link" href="#faq">Questions</a>
            </div>
          </nav>

          <div className="nav__actions">
            {user ? (
              <>
                <button
                  type="button"
                  className="nav__account"
                  onClick={sheet(onDashboard)}
                  aria-label={`My appointments${user.name ? `, signed in as ${user.name}` : ""}`}
                >
                  <span className="ui-avatar nav__avatar" data-tone="3" aria-hidden="true">
                    {user.name ? initials(user.name) : <UserRound {...ICON} />}
                  </span>
                  <span className="nav__account-label">My appointments</span>
                </button>
                <button type="button" className="nav__link" onClick={sheet(onLogout)}>
                  Sign out
                </button>
              </>
            ) : (
              <button type="button" className="nav__link" onClick={sheet(onLogin)}>
                Sign in
              </button>
            )}
            <a className="btn btn--primary" href="#doctors">
              {MAIN_ACTION}
            </a>
          </div>

          <button
            className="nav__toggle"
            type="button"
            aria-expanded="false"
            aria-label="Menu"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path
                d="M2 5h14M2 13h14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </header>

      <main id="top" ref={mainRef}>
        {/* HERO: centred */}
        <section className="hero hero--centred" aria-labelledby="hero-h">
          <div className="wrap">
            <div className="hero-text">
              <div className="hero__c">
                <a className="pill" href="#doctors">
                  <span>
                    {count
                      ? `${count} specialists in ${fields} fields`
                      : "Specialists in every field"}
                  </span>
                  <span className="muted">
                    {fromFee ? `Fees from ${fromFee}` : "See fees"}
                  </span>
                </a>

                <h1 id="hero-h">
                  <span className="mark hero-mark" data-mark="dots" aria-hidden="true" /> Book a
                  doctor’s appointment online
                </h1>

                <p className="hero__lead">
                  Compare specialists by fee and experience, book a free
                  slot and see the clinic confirm it in your account.
                </p>

                <div className="btn-row">
                  <a className="btn btn--primary" href="#doctors">
                    {MAIN_ACTION}
                  </a>
                  {!user && (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={onRegister}
                    >
                      Create an account
                    </button>
                  )}
                  {user && (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={onDashboard}
                    >
                      See my appointments
                    </button>
                  )}
                </div>
              </div>

              <HeroWindow doctors={doctors} />
            </div>
          </div>
        </section>

        {/* DOCTORS: the live app frame */}
        <section className="section" id="doctors" aria-labelledby="doctors-h">
          <div className="wrap">
            <div className="grid">
              <h2 id="doctors-h" className="span-6">
                Every specialist with fees and hours
              </h2>
              <p className="span-6 start-7 fd-intro">
                Search by name or field, open a doctor to read their
                experience and consultation fee, then book a slot from
                their card.
              </p>
            </div>

            <DoctorFinder
              doctors={doctors}
              loading={loadingDoctors}
              onBook={onBook}
            />
          </div>
        </section>

        {/* HOW: pinned-chapters */}
        {stepsHtml ? (
          <HowSection markup={stepsHtml} />
        ) : (
          <section
            className="section"
            id="how"
            style={{ "--h": 2 }}
            aria-labelledby="how-h"
          >
            <div className="wrap">
              <h2 id="how-h">Booking a visit takes three steps</h2>
            </div>
          </section>
        )}

        {/* DASHBOARD: split-text-left on the surface ground */}
        <section
          className="section ground-surface"
          id="dashboard"
          aria-labelledby="dashboard-h"
        >
          <div className="wrap">
            <div className="grid fill dash-grid">
              <div className="span-6 stack-dash">
                <h2 id="dashboard-h">Every visit in one patient dashboard</h2>
                <p className="t-lead">
                  Upcoming and past appointments sit in one list with their
                  status, so you always know what the clinic has confirmed.
                </p>
                <ul className="dash-facts">
                  <li>Reschedule to another free slot</li>
                  <li>Cancel a visit you no longer need</li>
                  <li>Keep your name and contact details current</li>
                </ul>
                <button type="button" className="link" onClick={onDashboard}>
                  Open your dashboard
                  {ARROW}
                </button>
              </div>

              <div className="frame frame--lit frame--fill dash-frame span-6 start-7">
                <div className="stage stage--fade-b">
                  <DashboardWindow doctors={doctors} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="section" id="faq" aria-labelledby="faq-h">
          <div className="wrap">
            <div className="grid">
              <div className="span-6 stack-dash">
                <h2 id="faq-h">Questions</h2>
                <p className="muted">
                  What patients ask before their first booking.
                </p>
                <button type="button" className="link" onClick={onRegister}>
                  Create an account
                  {ARROW}
                </button>
              </div>

              <div className="faq span-6 start-7">
                <div className="faq__item">
                  <h3>How much does a visit to a doctor cost?</h3>
                  <p>
                    Each doctor sets their own fee
                    {range
                      ? `, from ${rupees(range.min)} to ${rupees(range.max)}`
                      : ""}
                    . You see it on the doctor’s card before you book.
                  </p>
                </div>
                <div className="faq__item">
                  <h3>Do I need an account to book?</h3>
                  <p>
                    Yes. Create a free account with your email, then book
                    from any doctor’s card in a few clicks.
                  </p>
                </div>
                <div className="faq__item">
                  <h3>When is my appointment confirmed?</h3>
                  <p>
                    A new request shows as pending. It turns confirmed once
                    the clinic accepts it, and a notification tells you.
                  </p>
                </div>
                <div className="faq__item">
                  <h3>Can I change or cancel a booking?</h3>
                  <p>
                    Yes. From your dashboard you can move an upcoming visit
                    to another free slot or cancel it.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* CLOSE + FOOTER */}
      <footer
        className="footer closing footer--dark ground-inverse"
        id="contact"
        aria-labelledby="close-h"
      >
        <div className="wrap">
          <div className="closing__cta close--type">
            <div className="section-head">
              <h2 id="close-h">Book your next doctor’s visit</h2>
              <p>
                Free patient account
                {fromFee ? `, consultations from ${fromFee}` : ""}.
              </p>
            </div>
            <a
              className="btn btn--primary btn--xl btn--wide"
              href="#doctors"
            >
              {MAIN_ACTION}
              {ARROW}
            </a>
          </div>

          <div className="closing__links">
            <div className="grid">
              <div className="span-4 stack-4">
                <a className="nav__logo footer__name" href="#top" onClick={go("top")}>
                  <Logo />
                </a>
                <p className="footer__lede">
                  Online doctor appointments for patients.
                </p>
              </div>
              <div className="span-2 start-7 footer__col">
                <h4>Patients</h4>
                <ul>
                  <li><a href="#doctors">Doctors</a></li>
                  <li><a href="#how">Booking</a></li>
                  <li><a href="#faq">Questions</a></li>
                </ul>
              </div>
              <div className="span-2 footer__col">
                <h4>Account</h4>
                <ul>
                  <li>
                    <button type="button" className="m-link m-link--bare" onClick={user ? onDashboard : onLogin}>
                      {user ? "Dashboard" : "Sign in"}
                    </button>
                  </li>
                  {!user && (
                    <li>
                      <button type="button" className="m-link m-link--bare" onClick={onRegister}>
                        Create an account
                      </button>
                    </li>
                  )}
                </ul>
              </div>
              <div className="span-2 footer__col">
                <h4>Clinic</h4>
                <ul>
                  <li>
                    <button type="button" className="m-link m-link--bare" onClick={onAdmin}>
                      Staff sign in
                    </button>
                  </li>
                </ul>
              </div>
            </div>
            <div className="footer__legal">
              <span>© {new Date().getFullYear()} MediBook+</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
