// Kit markup the taste-skill scripts take over (fragments from /public/taste/ui and the
// pinned-chapters moment). React renders each block once through dangerouslySetInnerHTML and never
// touches it again, so the kit can move and animate its nodes freely.

const SEARCH_ICON =
  '<svg class="ui-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>';

const PERSON_ICON =
  '<svg class="ui-icon" viewBox="0 0 16 16"><circle cx="8" cy="6" r="2.5"/><path d="M3.5 13.5c.6-2.3 2.4-3.5 4.5-3.5s3.9 1.2 4.5 3.5"/></svg>';

const CHECK_ICON =
  '<svg class="ui-icon" viewBox="0 0 16 16"><path d="m3.5 8.4 2.8 2.8 6.2-6.4"/></svg>';

const CLOCK_ICON =
  '<svg class="ui-icon" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/></svg>';

const escape = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const rupees = (fee) => `&#8377;${Number(fee).toLocaleString("en-IN")}`;

function searchFragment(doctors) {
  const cardio = doctors.filter((d) => /cardio/i.test(d.specialty)).slice(0, 2);
  const rows = (cardio.length ? cardio : doctors.slice(0, 2))
    .concat(doctors.filter((d) => !/cardio/i.test(d.specialty)).slice(0, 1))
    .slice(0, 3);

  const items = rows
    .map((d, i) => {
      const specialty = escape(d.specialty).replace(/^(cardio)/i, "<b>$1</b>");
      return `<li class="ui-search__row${i === 0 ? " is-sel" : ""}"><span class="ui-search__ico">${PERSON_ICON}</span><span class="ui-search__t">${escape(d.name)}, ${specialty}</span><span class="ui-search__m">${rupees(d.fee)}</span></li>`;
    })
    .join("");

  // a second query from the page's own doctors: the loop types "cardio", then the first letters
  // shared by two or more other fields (dentist, dermatologist: "de"), so each cycle shows results
  const groups = new Map();
  doctors
    .filter((d) => !/cardio/i.test(d.specialty))
    .forEach((d) => {
      const stem = d.specialty.slice(0, 2).toLowerCase();
      groups.set(stem, [...(groups.get(stem) || []), d]);
    });
  const [stem, group] = [...groups].sort((a, b) => b[1].length - a[1].length)[0] || ["", []];
  const more = group.length >= 2
    ? group.slice(0, 3).map((d) => [PERSON_ICON, `${escape(d.name)}, <b>${escape(d.specialty.slice(0, 2))}</b>${escape(d.specialty.slice(2))}`, rupees(d.fee)])
    : [];
  const opts = more.length ? escape(JSON.stringify({ queries: [{ q: stem, rows: more }] })) : "";

  return `<div class="ui ui-panel ui-search" data-ui="search" data-ui-loop${opts ? ` data-ui-opts="${opts}"` : ""}>
  <div class="ui-search__field">${SEARCH_ICON}<span class="ui-search__q"><span data-search-q>cardio</span><i class="ui-search__caret"></i></span><kbd class="ui-search__kbd">Enter</kbd></div>
  <div class="ui-search__group">Doctors</div>
  <ul class="ui-search__list" data-search-list>${items}</ul>
  <div class="ui-search__foot"><span><kbd>&uarr;</kbd><kbd>&darr;</kbd> to move</span><span><kbd>Enter</kbd> to book</span></div>
</div>`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function calendarFragment(doctor, slots) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const prevDays = new Date(year, month, 0).getDate();
  const booked = Math.min(today.getDate() + 3, daysInMonth);
  const short = MONTHS[month].slice(0, 3);

  const cells = [];
  for (let i = lead; i > 0; i--) cells.push(`<span class="ui-cal__d is-out"><b>${prevDays - i + 1}</b></span>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const cls = ["ui-cal__d"];
    if (d === today.getDate()) cls.push("is-today");
    if (d === booked) cls.push("is-mark");
    cells.push(`<span class="${cls.join(" ")}" data-d="${d}"><b>${d}</b></span>`);
  }
  for (let d = 1; cells.length % 7; d++) cells.push(`<span class="ui-cal__d is-out"><b>${d}</b></span>`);

  const time = slots[1] || slots[0] || "11:00 AM";

  return `<div class="ui ui-panel ui-calendar" data-ui="calendar" data-start="${booked}" data-end="${booked}" data-month="${short}">
  <div class="ui-cal__head">
    <div class="ui-cal__month">${MONTHS[month]} <span>${year}</span></div>
    <span class="ui-spacer"></span>
    <span class="ui-chip ui-chip--plain ui-chip--ink" data-cal-range>${short} ${booked}</span>
  </div>
  <div class="ui-cal__dow" aria-hidden="true"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div>
  <div class="ui-cal__days">${cells.join("")}</div>
  <div class="ui-cal__events">
    <div class="ui-cal__ev" data-ev="${booked}">
      <span class="ui-cal__date"><b>${booked}</b><i>${short}</i></span>
      <span class="ui-cal__evtext"><span class="ui-cal__evtitle">${escape(time)} with ${escape(doctor.name)}</span><span class="ui-cal__evsub">${escape(doctor.specialty)}, consultation ${rupees(doctor.fee)}</span></span>
    </div>
  </div>
</div>`;
}

function notifyFragment(doctor, slots) {
  const time = escape(slots[1] || slots[0] || "11:00 AM");
  const name = escape(doctor.name);

  return `<div class="ui ui-notify" data-ui="notify">
  <ul class="ui-notify__list" data-notify-list>
    <li class="ui-note"><span class="ui-note__ico">${CHECK_ICON}</span><span class="ui-note__text"><span class="ui-note__title">Appointment confirmed<time>now</time></span><span class="ui-note__body">${name} at ${time}</span></span><span class="ui-btn ui-btn--sm ui-note__btn">View</span></li>
    <li class="ui-note"><span class="ui-note__ico">${CLOCK_ICON}</span><span class="ui-note__text"><span class="ui-note__title">Request sent, pending<time>4m</time></span><span class="ui-note__body">The clinic reviews it before confirming</span></span></li>
    <li class="ui-note"><span class="ui-avatar ui-note__av" data-tone="3">${escape(initials(doctor.name))}</span><span class="ui-note__text"><span class="ui-note__title">Booked with ${name}<time>5m</time></span><span class="ui-note__body">${escape(doctor.specialty)}, ${rupees(doctor.fee)}</span></span></li>
  </ul>
</div>`;
}

export function initials(name) {
  return String(name)
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

// the three booking steps, held by the pinned-chapters moment
export function stepsMarkup(doctors, slots) {
  const doctor =
    doctors.find((d) => /cardio/i.test(d.specialty)) || doctors[0];

  return `<div class="container wrap mo-pc__grid">
  <div class="mo-pc__text">
    <h2 id="how-h">Booking a visit takes three steps</h2>
    <ol class="mo-pc__steps">
      <li class="mo-pc__step">
        <h3>Specialist search by name or field</h3>
        <p>Search by a doctor's name or a field such as cardiology, and see the fee and experience before you choose.</p>
        <figure class="mo-pc__visual mo-pc__visual--lit" data-ui-pause-host><div class="fit" style="--fit-max:420px">${searchFragment(doctors)}</div></figure>
      </li>
      <li class="mo-pc__step">
        <h3>Calendar of free dates and times</h3>
        <p>Choose any day from today on. Times another patient already holds are greyed out, so a slot you pick is free.</p>
        <figure class="mo-pc__visual mo-pc__visual--lit"><div class="fit" style="--fit-max:420px">${calendarFragment(doctor, slots)}</div></figure>
      </li>
      <li class="mo-pc__step">
        <h3>Request status from pending to confirmed</h3>
        <p>Your request starts as pending. You get a notification the moment the clinic confirms, reschedules or cancels it.</p>
        <figure class="mo-pc__visual mo-pc__visual--lit"><div class="fit" style="--fit-max:420px">${notifyFragment(doctor, slots)}</div></figure>
      </li>
    </ol>
  </div>
  <div class="mo-pc__visuals frame"></div>
</div>`;
}
