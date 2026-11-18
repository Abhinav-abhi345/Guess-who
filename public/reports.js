const status = document.getElementById('reportStatus');
const tbody = document.getElementById('resultsBody');
const refresh = document.getElementById('refreshResults');
function players(results) {
  if (!results || typeof results !== 'object' || Array.isArray(results)) throw new Error('Invalid results format.');
  const users = Object.values(results);
  if (users.some(u => !u || typeof u.username !== 'string' || !Number.isSafeInteger(u.score) || u.score < 0)) throw new Error('Invalid results format.');
  return users.sort((a, b) => b.score - a.score);
}
function row(values) {
  const tr = document.createElement('tr');
  for (const value of values) { const td = document.createElement('td'); td.textContent = String(value); tr.appendChild(td); }
  tbody.appendChild(tr);
}
function failed(error) {
  tbody.replaceChildren();
  status.setAttribute('role', 'alert');
  status.textContent = 'Unable to load results. ' + error.message;
}
async function loadAdmin() {
  refresh.disabled = true;
  tbody.replaceChildren();
  status.setAttribute('role', 'status');
  status.textContent = 'Loading results...';
  try {
    const response = await fetch('/admin/results', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Please select Refresh Results to retry.');
    const history = await response.json();
    if (!Array.isArray(history)) throw new Error('Invalid results format.');
    // Validate before rendering so a malformed report cannot leave a misleading partial table.
    const reports = history.map(entry => ({ completed: new Date(entry.completedAt).toLocaleString(), users: players(entry.results) }));
    for (const report of reports.reverse()) for (const user of report.users) row([report.completed, user.username, user.score]);
    status.textContent = reports.length ? `${reports.length} completed quiz report(s).` : 'No completed quizzes yet. Start a quiz from Admin Home.';
  } catch (error) { failed(error); }
  finally { refresh.disabled = false; }
}
if (document.body.dataset.report === 'admin') {
  refresh.addEventListener('click', loadAdmin);
  loadAdmin();
} else {
  try {
    const raw = sessionStorage.getItem('quizResults');
    const users = raw ? players(JSON.parse(raw)) : [];
    for (const user of users) row([user.username, user.score]);
    status.textContent = users.length ? 'Quiz complete.' : 'No quiz results yet. Join a quiz to see your score.';
  } catch (error) { failed(error); }
}
