/* =====================================================
   MentorMatch - Student Mentorship Matching
   Flow: registration / login page  ->  main website
   Everything is saved in localStorage (no backend).
   NOTE: passwords are stored as plain text only because this
   is a college demo - a real site must hash them on a server.
   ===================================================== */

const STORAGE_KEY = 'mentormatch_data_v3';
const SESSION_KEY = 'mentormatch_session';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const COLORS = ['#ffd23f', '#ff7eb3', '#6ee7c8', '#8fa8ff', '#ff9f43'];
const ADMIN = { id: 'admin', role: 'admin', name: 'Admin', email: 'admin@mentormatch.demo', password: 'admin123' };
const $ = sel => document.querySelector(sel);

// ---------- sample data so the app isn't empty the first time ----------
function sampleData() {
  return {
    users: [
      { id: 'm1', role: 'mentor', name: 'Dr. Anita Sharma', email: 'anita@mentormatch.demo', password: '1234', dept: 'Computer Science', interests: ['Web Development', 'AI', 'Databases'], goals: 'Guide students towards software careers', bio: 'Professor with 10 years of experience in web and AI projects', availability: ['Mon', 'Wed', 'Fri'], capacity: 2 },
      { id: 'm2', role: 'mentor', name: 'Rohan Mehta', email: 'rohan@mentormatch.demo', password: '1234', dept: 'Electronics', interests: ['IoT', 'Embedded Systems', 'Robotics'], goals: 'Help juniors build hardware projects', bio: 'Research scholar working on IoT and robotics', availability: ['Tue', 'Thu', 'Sat'], capacity: 3 },
      { id: 'm3', role: 'mentor', name: 'Priya Nair', email: 'priya@mentormatch.demo', password: '1234', dept: 'Management', interests: ['Entrepreneurship', 'Marketing', 'Public Speaking'], goals: 'Support students with startups and communication', bio: 'Startup founder and alumni mentor', availability: ['Mon', 'Thu', 'Sun'], capacity: 2 },
      { id: 's1', role: 'mentee', name: 'Aman Verma', email: 'aman@mentormatch.demo', password: '1234', dept: 'Computer Science', interests: ['Web Development', 'AI'], goals: 'Learn web development and build a strong portfolio', bio: 'Second year student', availability: ['Mon', 'Fri'], capacity: 0 }
    ],
    invites: [],   // {id, menteeId, mentorId, status, msg, date}
    meetings: [],  // {id, inviteId, date, topic, notes}
    feedback: []   // {id, inviteId, from, rating, comment}
  };
}

let db = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || sampleData();
let state = { me: localStorage.getItem(SESSION_KEY) || '', tab: 'home', authTab: 'login', filter: '', inviteTo: null };

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
function getUser(id) { return id === 'admin' ? ADMIN : db.users.find(u => u.id === id); }
function newId() { return Math.random().toString(36).slice(2, 9); }
function today() { return new Date().toISOString().slice(0, 10); }
function esc(text) { // stops users from breaking the page by typing html
  return String(text == null ? '' : text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 2300);
}

// ---------- small UI helpers ----------
function avatar(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % COLORS.length;
  const initials = name.replace(/^Dr\.?\s*/, '').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return `<span class="avatar" style="background:${COLORS[hash]}">${initials}</span>`;
}
function tagList(list, shared = []) {
  const low = shared.map(s => s.toLowerCase());
  return list.map(x => `<span class="tag ${low.includes(x.toLowerCase()) ? 'shared' : ''}">${esc(x)}</span>`).join('');
}
function badge(status) { return `<span class="badge ${status}">${status}</span>`; }
function filled(mentorId) { return db.invites.filter(i => i.mentorId === mentorId && i.status === 'accepted').length; }

// little bars that show WHY a mentor got that score
function breakdown(match) {
  const row = (label, val) => `<div class="mini"><span>${label}</span><div class="track"><i style="width:${val}%"></i></div><b>${val}%</b></div>`;
  return `<div class="breakdown">${row('Interests', match.parts.interest)}${row('Goals', match.parts.goal)}${row('Availability', match.parts.avail)}</div>`;
}

// ---------- THE MATCHING ALGORITHM ----------
// score out of 100 = 50% interests + 20% goals + 30% availability
function getMatch(mentee, mentor) {
  const menteeInt = mentee.interests.map(x => x.toLowerCase());
  const mentorInt = mentor.interests.map(x => x.toLowerCase());
  const sharedInterests = mentee.interests.filter(x => mentorInt.includes(x.toLowerCase()));
  const totalUnique = new Set([...menteeInt, ...mentorInt]).size || 1;
  const interestPart = sharedInterests.length / totalUnique;

  // goals: how many words of the mentee's goal appear in the mentor's profile
  const split = t => (t || '').toLowerCase().split(/[^a-z0-9+#]+/).filter(w => w.length > 2);
  const mentorWords = new Set([...split(mentor.bio), ...split(mentor.goals), ...mentorInt.flatMap(split)]);
  const goalWords = split(mentee.goals);
  const goalPart = goalWords.length ? goalWords.filter(w => mentorWords.has(w)).length / goalWords.length : 0;

  const sharedDays = mentee.availability.filter(d => mentor.availability.includes(d));
  const fewest = Math.min(mentee.availability.length, mentor.availability.length);
  const availPart = fewest ? sharedDays.length / fewest : 0;

  const total = Math.round((interestPart * 0.5 + Math.min(goalPart * 2, 1) * 0.2 + availPart * 0.3) * 100);
  const parts = { interest: Math.round(interestPart * 100), goal: Math.round(Math.min(goalPart * 2, 1) * 100), avail: Math.round(availPart * 100) };
  return { total, sharedInterests, sharedDays, parts };
}

/* =====================================================
   STEP 1 - REGISTRATION / LOGIN PAGE
   ===================================================== */
function setAuth(tab) { state.authTab = tab; render(); }

function authPage() {
  const login = state.authTab === 'login';
  return `
  <section class="auth-left">
    <div class="blob b1"></div><div class="blob b2"></div>
    <a class="logo" href="#">🎓 Mentor<b>Match</b></a>
    <h1>Find a mentor who actually gets your goals.</h1>
    <p>A student mentorship platform that matches mentees and mentors using academic interests, goals and weekly availability.</p>
    <div class="points">
      <div>🎯 <b>Smart matching</b> - every mentor gets a score out of 100</div>
      <div>📨 <b>Invitation workflow</b> - send, accept or decline requests</div>
      <div>📒 <b>Meeting logs &amp; feedback</b> - track progress after every session</div>
      <div>🛡 <b>Admin oversight</b> - monitor users, pairings and ratings</div>
    </div>
  </section>
  <section class="auth-right"><div class="authbox">
    <div class="switch">
      <button class="${login ? 'on' : ''}" onclick="setAuth('login')">Log in</button>
      <button class="${login ? '' : 'on'}" onclick="setAuth('register')">Create account</button>
    </div>
    ${login ? loginForm() : registerForm()}
  </div></section>`;
}

function loginForm() {
  return `<h2>Welcome back 👋</h2><p class="muted">Log in to open your dashboard.</p>
  <form onsubmit="doLogin(event)">
    <label>Email</label><input id="l_email" type="email" required placeholder="you@college.edu">
    <label>Password</label><input id="l_pass" type="password" required placeholder="Your password">
    <button class="btn full" type="submit">Log in</button>
  </form>
  <div class="demo"><b>Demo accounts</b> (tap to fill):<br>
    <button type="button" onclick="fillLogin('aman@mentormatch.demo', '1234')">Mentee</button>
    <button type="button" onclick="fillLogin('anita@mentormatch.demo', '1234')">Mentor</button>
    <button type="button" onclick="fillLogin('admin@mentormatch.demo', 'admin123')">Admin</button></div>`;
}
function fillLogin(email, pass) { $('#l_email').value = email; $('#l_pass').value = pass; }

function doLogin(e) {
  e.preventDefault();
  const email = $('#l_email').value.trim().toLowerCase(), pass = $('#l_pass').value;
  const user = email === ADMIN.email ? ADMIN : db.users.find(u => u.email === email);
  if (!user || user.password !== pass) { toast('Wrong email or password'); return; }
  startSession(user.id);
  toast('Welcome back, ' + user.name.split(' ')[0] + '!');
}
function startSession(id) {
  state.me = id; state.tab = 'home';
  localStorage.setItem(SESSION_KEY, id);
  render(); window.scrollTo(0, 0);
}
function logout() {
  state.me = ''; state.authTab = 'login';
  localStorage.removeItem(SESSION_KEY);
  render(); toast('Logged out');
}

// the profile fields are shared by registration and "edit profile"
function profileFields(u, showCap) {
  return `
    <label>Department / program</label><input id="f_dept" required value="${esc(u.dept)}">
    <label>Academic interests (separate with commas)</label>
    <input id="f_int" required value="${esc(u.interests.join(', '))}" placeholder="Web Development, AI">
    <label>Your goals</label><textarea id="f_goals" rows="2" required>${esc(u.goals)}</textarea>
    <label>Short bio</label><textarea id="f_bio" rows="2">${esc(u.bio)}</textarea>
    <label>Days you are available</label>
    <div class="days">${DAYS.map(d => `<label><input type="checkbox" class="f_day" value="${d}" ${u.availability.includes(d) ? 'checked' : ''}> ${d}</label>`).join('')}</div>
    <div id="capBox" style="display:${showCap ? 'block' : 'none'}">
      <label>How many mentees can you take?</label><input type="number" id="f_cap" min="1" max="10" value="${u.capacity || 2}"></div>`;
}
function readProfile() {
  const days = [...document.querySelectorAll('.f_day:checked')].map(x => x.value);
  if (days.length === 0) { toast('Please pick at least one available day'); return null; }
  return {
    dept: $('#f_dept').value.trim(),
    interests: $('#f_int').value.split(',').map(x => x.trim()).filter(x => x),
    goals: $('#f_goals').value.trim(),
    bio: $('#f_bio').value.trim(),
    availability: days
  };
}

function registerForm() {
  const blank = { dept: '', interests: [], goals: '', bio: '', availability: [], capacity: 2 };
  return `<h2>Join MentorMatch 🚀</h2><p class="muted">Create your account and profile - it only takes a minute.</p>
  <form onsubmit="doRegister(event)">
    <div class="choose">
      <label class="pick"><input type="radio" name="role" value="mentee" checked onchange="$('#capBox').style.display='none'"><span>🎒 I'm a mentee</span></label>
      <label class="pick"><input type="radio" name="role" value="mentor" onchange="$('#capBox').style.display='block'"><span>🧑‍🏫 I'm a mentor</span></label>
    </div>
    <label>Full name</label><input id="r_name" required>
    <label>Email</label><input id="r_email" type="email" required>
    <label>Password (min 4 characters)</label><input id="r_pass" type="password" minlength="4" required>
    ${profileFields(blank, false)}
    <button class="btn full" type="submit" style="margin-top:14px">Create account</button>
  </form>`;
}
function doRegister(e) {
  e.preventDefault();
  const email = $('#r_email').value.trim().toLowerCase();
  if (email === ADMIN.email || db.users.some(u => u.email === email)) { toast('That email is already registered'); return; }
  const data = readProfile();
  if (!data) return;
  const role = document.querySelector('input[name="role"]:checked').value;
  const user = { id: newId(), role, name: $('#r_name').value.trim(), email, password: $('#r_pass').value, capacity: role === 'mentor' ? Number($('#f_cap').value) || 2 : 0, ...data };
  db.users.push(user); save();
  startSession(user.id);
  toast('Account created - welcome aboard! 🎉');
}

/* =====================================================
   STEP 2 - MAIN WEBSITE
   ===================================================== */
const TAB_INFO = {
  home: ['🏠', 'Your dashboard: a quick summary and everything you need to know about how the platform works.'],
  find: ['🔍', 'Mentors are ranked by match score. Green tags are interests you share. Pick a mentor and send an invitation.'],
  sent: ['📨', 'Track every invitation you sent. Pending means the mentor has not replied yet. You can withdraw a pending invitation.'],
  pairs: ['📒', 'Appears for accepted pairs only. Log each meeting (date, topic, notes) and rate the mentorship.'],
  profile: ['👤', 'Keep your interests, goals and free days up to date - the matching score is calculated from these fields.'],
  inbox: ['📨', 'Students who want you as their mentor. Accept to start the mentorship (limited by your capacity) or decline.'],
  users: ['👥', 'Every registered mentor and mentee. Admin can remove a user with their invitations, meetings and feedback.'],
  pairings: ['🤝', 'All invitations in the system. Admin can approve a pending request or end an active pairing.'],
  feedback: ['⭐', 'All ratings and comments from mentors and mentees, so programme quality can be monitored.']
};
function setTab(id) { state.tab = id; render(); window.scrollTo(0, 0); }

// ---------- Home dashboard ----------
function homePage(me) {
  const first = me.name.split(' ')[0];
  let welcome = '', extra = '';
  if (me.role === 'mentee') {
    const sent = db.invites.filter(i => i.menteeId === me.id);
    const best = db.users.filter(u => u.role === 'mentor').map(m => ({ m, s: getMatch(me, m) })).sort((a, b) => b.s.total - a.s.total)[0];
    welcome = `<p>You have sent <b>${sent.length}</b> invitation(s), <b>${sent.filter(i => i.status === 'accepted').length}</b> accepted.</p>`;
    if (best) extra = `<div class="card" style="margin-bottom:18px"><h3>⭐ Your best match right now</h3>
      <div class="head">${avatar(best.m.name)}<div><b>${esc(best.m.name)}</b><br><span class="muted">${esc(best.m.dept)}</span></div><div class="ring" style="--p:${best.s.total}"><span>${best.s.total}%</span></div></div>
      <button class="btn" onclick="setTab('find')">See all mentors</button></div>`;
  } else if (me.role === 'mentor') {
    welcome = `<p><b>${db.invites.filter(i => i.mentorId === me.id && i.status === 'pending').length}</b> pending request(s) · <b>${filled(me.id)}</b> of <b>${me.capacity}</b> places filled.</p>`;
  } else {
    return adminOverview();
  }
  return `<div class="welcome"><h1>Hi ${esc(first)} 👋</h1>${welcome}</div>${extra}${infoSections()}`;
}
function infoSections() {
  return `<section class="two">
    <div class="card"><h3>📐 How the match score works</h3>
      <p class="muted">Every mentor gets a score out of 100 for each student:</p>
      <div class="breakdown big">
        <div class="mini"><span>Academic interests</span><div class="track"><i style="width:50%"></i></div><b>50%</b></div>
        <div class="mini"><span>Goals vs mentor bio</span><div class="track"><i style="width:20%"></i></div><b>20%</b></div>
        <div class="mini"><span>Common free days</span><div class="track"><i style="width:30%"></i></div><b>30%</b></div>
      </div>
      <p class="muted">Interests use shared / total interests. Goals are matched by keywords in the mentor's bio. Availability counts weekdays both people are free.</p></div>
    <div class="card"><h3>🧭 How the mentorship works</h3>
      <ol class="list"><li>Mentee sends an invitation to a mentor.</li><li>Mentor accepts or declines (capacity is limited).</li><li>Both log meetings after each session.</li><li>Both give feedback; admin monitors everything.</li></ol></div>
  </section>
  <section class="card" style="margin-top:18px"><h3>❓ Quick FAQ</h3>
    <p><b>Where is my data stored?</b><br><span class="muted">In your own browser (localStorage), so it stays after a refresh.</span></p>
    <p><b>Why can't I invite some mentors?</b><br><span class="muted">A mentor who has filled every place cannot accept new mentees.</span></p>
    <p><b>Can I change my interests later?</b><br><span class="muted">Yes - open "My Profile". Your match scores update immediately.</span></p></section>`;
}

// ---------- mentee: find mentors ----------
function findMentors(me) {
  const keyword = state.filter.toLowerCase();
  const list = db.users.filter(u => u.role === 'mentor')
    .filter(m => (m.dept + ' ' + m.interests.join(' ')).toLowerCase().includes(keyword))
    .map(m => ({ m, match: getMatch(me, m) }))
    .sort((a, b) => b.match.total - a.match.total);

  const cards = list.map(({ m, match }) => {
    const existing = db.invites.find(i => i.menteeId === me.id && i.mentorId === m.id && i.status !== 'declined');
    const full = filled(m.id) >= m.capacity;
    return `<div class="card">
      <div class="head">${avatar(m.name)}<div><h3>${esc(m.name)}</h3><span class="muted">${esc(m.dept)}</span></div>
        <div class="ring" style="--p:${match.total}"><span>${match.total}%</span></div></div>
      <p class="muted">${esc(m.bio)}</p>
      <div>${tagList(m.interests, match.sharedInterests)}</div>
      ${breakdown(match)}
      <p class="muted">📅 ${m.availability.join(', ')}${match.sharedDays.length ? ` &nbsp;·&nbsp; <b>common: ${match.sharedDays.join(', ')}</b>` : ''}<br>
      👥 ${filled(m.id)} of ${m.capacity} places taken</p>
      ${existing ? badge(existing.status) : `<button class="btn" ${full ? 'disabled' : ''} onclick="openInvite('${m.id}')">${full ? 'No places left' : 'Send invitation'}</button>`}
    </div>`;
  }).join('');

  return `<div class="card" style="margin-bottom:18px"><label style="margin-top:0">🔍 Filter by department or interest</label>
    <input id="filter" value="${esc(state.filter)}" placeholder="e.g. AI, Electronics" oninput="state.filter = this.value; render()"></div>
    <div class="grid">${cards || '<div class="empty">No mentors match that search.</div>'}</div>`;
}
function openInvite(mentorId) {
  state.inviteTo = mentorId;
  $('#inviteName').textContent = getUser(mentorId).name;
  $('#inviteBox').showModal();
}
function confirmInvite(e) {
  e.preventDefault();
  db.invites.push({ id: newId(), menteeId: state.me, mentorId: state.inviteTo, status: 'pending', msg: $('#inviteMsg').value.trim(), date: today() });
  save(); $('#inviteBox').close(); toast('Invitation sent 📨'); render();
}
function myInvitations(me) {
  const list = db.invites.filter(i => i.menteeId === me.id);
  if (!list.length) return '<div class="empty">You haven\'t sent any invitations yet. Head to "Find Mentors" to start.</div>';
  return `<div class="grid">${list.map(i => `<div class="card">
    <div class="head">${avatar(getUser(i.mentorId).name)}<div><h3>${esc(getUser(i.mentorId).name)}</h3><span class="muted">Sent ${i.date}</span></div>${badge(i.status)}</div>
    <p class="muted">"${esc(i.msg)}"</p>
    ${i.status === 'pending' ? `<button class="btn ghost" onclick="withdraw('${i.id}')">Withdraw</button>` : ''}</div>`).join('')}</div>`;
}
function withdraw(id) { db.invites = db.invites.filter(i => i.id !== id); save(); render(); }

// ---------- mentor: incoming invitations ----------
function mentorInbox(me) {
  const list = db.invites.filter(i => i.mentorId === me.id && i.status === 'pending');
  if (!list.length) return '<div class="empty">No pending invitations right now 🌤</div>';
  return `<div class="grid">${list.map(i => {
    const s = getUser(i.menteeId), match = getMatch(s, me), full = filled(me.id) >= me.capacity;
    return `<div class="card">
      <div class="head">${avatar(s.name)}<div><h3>${esc(s.name)}</h3><span class="muted">${esc(s.dept)}</span></div>
        <div class="ring" style="--p:${match.total}"><span>${match.total}%</span></div></div>
      <div>${tagList(s.interests, match.sharedInterests)}</div>
      ${breakdown(match)}
      <p class="muted"><b>Goal:</b> ${esc(s.goals)}</p><p class="muted">"${esc(i.msg)}"</p>
      <button class="btn green" ${full ? 'disabled' : ''} onclick="respond('${i.id}', 'accepted')">Accept</button>
      <button class="btn red" onclick="respond('${i.id}', 'declined')">Decline</button>
      ${full ? '<p class="muted">You have reached your capacity.</p>' : ''}</div>`;
  }).join('')}</div>`;
}
function respond(id, status) {
  db.invites.find(i => i.id === id).status = status;
  save(); toast('Invitation ' + status); render();
}

// ---------- meetings + feedback (mentor and mentee both use this) ----------
function activePairs(me) {
  const list = db.invites.filter(i => i.status === 'accepted' && (i.menteeId === me.id || i.mentorId === me.id));
  if (!list.length) return '<div class="empty">No active mentorship yet. Once an invitation is accepted it shows up here.</div>';
  return `<div class="grid wide">${list.map(i => {
    const other = getUser(me.role === 'mentor' ? i.menteeId : i.mentorId);
    const meetings = db.meetings.filter(m => m.inviteId === i.id).sort((a, b) => b.date.localeCompare(a.date));
    const fb = db.feedback.filter(f => f.inviteId === i.id);
    const gave = fb.some(f => f.from === me.id);
    return `<div class="card">
      <div class="head">${avatar(other.name)}<div><h3>${esc(other.name)}</h3><span class="muted">${me.role === 'mentor' ? 'Your mentee' : 'Your mentor'} · ${esc(other.dept)}</span></div></div>
      <div class="sub"><b>📒 Meeting log (${meetings.length})</b>
        ${meetings.map(m => `<p class="muted">${m.date} — <b>${esc(m.topic)}</b><br>${esc(m.notes)}</p>`).join('') || '<p class="muted">Nothing logged yet.</p>'}
        <form onsubmit="addMeeting(event, '${i.id}')">
          <input type="date" class="m_date" required value="${today()}">
          <input class="m_topic" required placeholder="Topic discussed" style="margin-top:6px">
          <textarea class="m_notes" rows="2" placeholder="Notes / next steps" style="margin-top:6px"></textarea>
          <button class="btn" type="submit">Log meeting</button></form></div>
      <div class="sub"><b>⭐ Feedback</b>
        ${fb.map(f => `<p class="muted">${'⭐'.repeat(f.rating)} <b>${esc(getUser(f.from).name)}:</b> ${esc(f.comment)}</p>`).join('') || '<p class="muted">No feedback yet.</p>'}
        ${gave ? '<p class="muted">✔ You already gave feedback.</p>' : `
        <form onsubmit="addFeedback(event, '${i.id}')">
          <select class="f_rating"><option value="5">5 - Excellent</option><option value="4">4 - Good</option><option value="3">3 - Okay</option><option value="2">2 - Poor</option><option value="1">1 - Very poor</option></select>
          <textarea class="f_comment" rows="2" required placeholder="How did it go?" style="margin-top:6px"></textarea>
          <button class="btn" type="submit">Submit feedback</button></form>`}
      </div></div>`;
  }).join('')}</div>`;
}
function addMeeting(e, inviteId) {
  e.preventDefault();
  const f = e.target;
  db.meetings.push({ id: newId(), inviteId, date: f.querySelector('.m_date').value, topic: f.querySelector('.m_topic').value.trim(), notes: f.querySelector('.m_notes').value.trim() });
  save(); toast('Meeting logged 📒'); render();
}
function addFeedback(e, inviteId) {
  e.preventDefault();
  const f = e.target;
  db.feedback.push({ id: newId(), inviteId, from: state.me, rating: Number(f.querySelector('.f_rating').value), comment: f.querySelector('.f_comment').value.trim() });
  save(); toast('Thanks for the feedback!'); render();
}

// ---------- edit profile ----------
function profilePage(me) {
  return `<div class="card formcard"><h2>Edit your profile</h2>
    <p class="muted">${esc(me.name)} · ${esc(me.email)} · ${me.role}</p>
    <form onsubmit="saveProfile(event)">${profileFields(me, me.role === 'mentor')}
    <button class="btn green" type="submit" style="margin-top:14px">Save profile</button></form></div>`;
}
function saveProfile(e) {
  e.preventDefault();
  const data = readProfile();
  if (!data) return;
  const me = getUser(state.me);
  Object.assign(me, data);
  if (me.role === 'mentor') me.capacity = Number($('#f_cap').value) || 1;
  save(); toast('Profile updated ✔'); render();
}

// ---------- admin pages ----------
function adminOverview() {
  const mentors = db.users.filter(u => u.role === 'mentor').length;
  const active = db.invites.filter(i => i.status === 'accepted').length;
  const pending = db.invites.filter(i => i.status === 'pending').length;
  const avg = db.feedback.length ? (db.feedback.reduce((sum, f) => sum + f.rating, 0) / db.feedback.length).toFixed(1) : '-';
  const waiting = db.users.filter(u => u.role === 'mentee' && !db.invites.some(i => i.menteeId === u.id && i.status === 'accepted'));
  return `<div class="stats">
    <div class="stat"><b>${mentors}</b>Mentors</div><div class="stat"><b>${db.users.length - mentors}</b>Mentees</div>
    <div class="stat"><b>${active}</b>Active pairs</div><div class="stat"><b>${pending}</b>Pending</div>
    <div class="stat"><b>${db.meetings.length}</b>Meetings</div><div class="stat"><b>${avg}</b>Avg rating</div></div>
    <div class="card"><h3>Mentees still without a mentor</h3>
      ${waiting.map(u => `<span class="tag">${esc(u.name)}</span>`).join('') || '<p class="muted">Everyone has a mentor 🎉</p>'}
      <div class="sub"><button class="btn ghost" onclick="resetData()">Reset to sample data</button></div></div>`;
}
function resetData() {
  if (confirm('This deletes everything and restores the sample data. Continue?')) { db = sampleData(); save(); render(); }
}
function adminUsers() {
  return `<div class="tablewrap"><table><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Interests</th><th>Free days</th><th></th></tr>
  ${db.users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role}</td><td>${esc(u.dept)}</td><td>${esc(u.interests.join(', '))}</td><td>${u.availability.join(', ')}</td>
  <td><button class="btn red" onclick="removeUser('${u.id}')">Remove</button></td></tr>`).join('')}</table></div>`;
}
function removeUser(id) {
  if (!confirm('Remove this user and everything connected to them?')) return;
  const gone = db.invites.filter(i => i.menteeId === id || i.mentorId === id).map(i => i.id);
  db.invites = db.invites.filter(i => !gone.includes(i.id));
  db.meetings = db.meetings.filter(m => !gone.includes(m.inviteId));
  db.feedback = db.feedback.filter(f => !gone.includes(f.inviteId));
  db.users = db.users.filter(u => u.id !== id);
  save(); render();
}
function adminPairings() {
  if (!db.invites.length) return '<div class="empty">No invitations have been sent yet.</div>';
  return `<div class="tablewrap"><table><tr><th>Mentee</th><th>Mentor</th><th>Match</th><th>Status</th><th>Meetings</th><th>Action</th></tr>
  ${db.invites.map(i => {
    const s = getUser(i.menteeId), m = getUser(i.mentorId);
    return `<tr><td>${esc(s.name)}</td><td>${esc(m.name)}</td><td>${getMatch(s, m).total}%</td><td>${badge(i.status)}</td>
    <td>${db.meetings.filter(x => x.inviteId === i.id).length}</td>
    <td>${i.status === 'accepted' ? `<button class="btn red" onclick="respond('${i.id}', 'declined')">End pairing</button>` : ''}${i.status === 'pending' ? `<button class="btn green" onclick="respond('${i.id}', 'accepted')">Approve</button>` : ''}</td></tr>`;
  }).join('')}</table></div>`;
}
function adminFeedback() {
  if (!db.feedback.length) return '<div class="empty">No feedback has been submitted yet.</div>';
  return `<div class="grid">${db.feedback.map(f => {
    const inv = db.invites.find(i => i.id === f.inviteId);
    return `<div class="card"><b>${'⭐'.repeat(f.rating)}</b><p>${esc(f.comment)}</p>
    <p class="muted">From ${esc(getUser(f.from).name)}<br>Pair: ${esc(getUser(inv.menteeId).name)} ↔ ${esc(getUser(inv.mentorId).name)}</p></div>`;
  }).join('')}</div>`;
}

// ---------- main render: decides between auth page and website ----------
function render() {
  const me = getUser(state.me);
  $('#auth').classList.toggle('hidden', !!me);
  $('#site').classList.toggle('hidden', !me);
  if (!me) { $('#auth').innerHTML = authPage(); return; }

  // each role gets its own sidebar menu
  const pending = db.invites.filter(i => i.mentorId === me.id && i.status === 'pending').length;
  const menus = {
    mentee: [['home', '🏠', 'Home'], ['find', '🔍', 'Find Mentors'], ['sent', '📨', 'My Invitations'], ['pairs', '📒', 'Meetings & Feedback'], ['profile', '👤', 'My Profile']],
    mentor: [['home', '🏠', 'Home'], ['inbox', '📨', 'Invitations', pending], ['pairs', '🧑‍🏫', 'My Mentees'], ['profile', '👤', 'My Profile']],
    admin: [['home', '📊', 'Overview'], ['users', '👥', 'Users'], ['pairings', '🤝', 'Pairings'], ['feedback', '⭐', 'Feedback']]
  }[me.role];
  if (!menus.some(m => m[0] === state.tab)) state.tab = 'home';

  const pages = {
    home: () => homePage(me), find: () => findMentors(me), sent: () => myInvitations(me), pairs: () => activePairs(me),
    profile: () => profilePage(me), inbox: () => mentorInbox(me), users: adminUsers, pairings: adminPairings, feedback: adminFeedback
  };

  $('#userbox').innerHTML = `${avatar(me.name)}<div><b>${esc(me.name)}</b><small>${me.role}</small></div>`;
  $('#menu').innerHTML = menus.map(([id, icon, label, count]) =>
    `<button class="${id === state.tab ? 'active' : ''}" onclick="setTab('${id}')"><span>${icon}</span>${label}${count ? `<em>${count}</em>` : ''}</button>`).join('');

  const hadFocus = document.activeElement && document.activeElement.id === 'filter';
  const info = TAB_INFO[state.tab];
  const skipInfo = state.tab === 'home' && me.role !== 'admin'; // home already has its own welcome box
  $('#app').innerHTML = (info && !skipInfo ? `<div class="info"><span>${info[0]}</span><p>${info[1]}</p></div>` : '') + pages[state.tab]();
  if (hadFocus) { const box = $('#filter'); box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
}

render();
