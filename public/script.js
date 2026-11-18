const socket = io();
let locked = true;
let countdown;
let activeQuestion;
let quizInProgress = false;
let serverIncompatible = false;
const status = document.getElementById('gameStatus');
const photo1 = document.getElementById('photo1');
const photo2 = document.getElementById('photo2');
const options = document.getElementById('options');
function disableButtons(disabled = true) { options.querySelectorAll('button').forEach(b => b.disabled = disabled); }
function username() { try { return sessionStorage.getItem('username') || 'Guest'; } catch { return 'Guest'; } }
window.addEventListener('beforeunload', event => {
  if (!quizInProgress) return;
  event.preventDefault();
  event.returnValue = '';
});
function incompatibleServer() {
  serverIncompatible = true;
  clearInterval(countdown);
  locked = true;
  activeQuestion = null;
  quizInProgress = false;
  options.replaceChildren();
  document.getElementById('imageContainer').hidden = true;
  document.getElementById('timeText').textContent = '0';
  document.querySelector('.progress').style.strokeDashoffset = '0';
  status.textContent = 'The server needs an update. Please restart the app server and reload this page.';
}
socket.on('connect', () => {
  status.textContent = 'Waiting for the host to start the quiz.';
  socket.timeout(5000).emit('registerUser', username(), (error, result) => {
    if (serverIncompatible) return;
    if (error || !result?.ok) status.textContent = error ? 'Unable to join. Please check that the app server is updated, then reload.' : result?.message || 'Unable to join. Please reload to retry.';
  });
});
socket.on('disconnect', () => {
  clearInterval(countdown); locked = true; disableButtons();
  status.textContent = 'Disconnected. Waiting to reconnect...';
});
socket.on('connect_error', () => status.textContent = 'Unable to connect. Retrying...');
socket.on('quizError', data => status.textContent = data.message);
socket.on('quizState', data => {
  if (data.state === 'waiting') {
    quizInProgress = false;
    clearInterval(countdown); locked = true; activeQuestion = null;
    options.replaceChildren(); document.getElementById('imageContainer').hidden = true;
    document.getElementById('timeText').textContent = '0';
    status.textContent = 'Waiting for the host to start the quiz.';
  }
});
for (const image of [photo1, photo2]) image.addEventListener('error', () => {
  status.textContent = 'An image could not be loaded. You can still choose an answer or wait for the next question.';
});
socket.on('newQuestion', data => {
  if (!data || typeof data.questionId !== 'string' || !data.questionId || !Number.isFinite(data.deadline) || !Number.isFinite(data.durationMs) || data.durationMs <= 0 || !data.question || !Array.isArray(data.question.options) || !data.question.options.length || data.question.options.some(option => typeof option !== 'string')) {
    incompatibleServer();
    return;
  }
  quizInProgress = true;
  serverIncompatible = false;
  clearInterval(countdown);
  activeQuestion = data.questionId;
  locked = false;
  document.getElementById('imageContainer').hidden = false;
  photo1.src = data.question.image1;
  photo2.style.display = 'none';
  photo2.removeAttribute('src');
  status.textContent = 'Choose one answer before time runs out.';
  options.replaceChildren();
  // Each browser shuffles its own copy; submissions still identify the answer by text.
  const playerOptions = [...data.question.options];
  for (let i = playerOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playerOptions[i], playerOptions[j]] = [playerOptions[j], playerOptions[i]];
  }
  for (const answer of playerOptions) {
    const button = document.createElement('button');
    button.textContent = answer;
    button.addEventListener('click', () => {
      if (locked) return;
      locked = true; disableButtons();
      const questionId = activeQuestion;
      status.textContent = 'Submitting your answer...';
      socket.timeout(5000).emit('submitAnswer', { questionId, answer }, (error, result) => {
        if (questionId !== activeQuestion) return;
        if (error || !result?.ok) {
          // Do not retry a possibly accepted answer automatically.
          status.textContent = error ? 'Answer confirmation timed out. Please wait for the next question.' : result?.message || 'Unable to record the answer. Please wait for the next question.';
          return;
        }
        button.classList.add(result.correct ? 'correct' : 'wrong');
        photo2.src = result.image2;
        photo2.style.display = 'block';
        status.textContent = result.correct ? 'Correct! Waiting for the next question.' : 'Answer recorded. Waiting for the next question.';
      });
    });
    options.appendChild(button);
  }
  function tick() {
    const remaining = Math.max(0, data.deadline - Date.now());
    document.getElementById('timeText').textContent = String(Math.ceil(remaining / 1000));
    document.querySelector('.progress').style.strokeDashoffset = String(283 * (1 - Math.min(1, remaining / data.durationMs)));
    if (!remaining) {
      clearInterval(countdown); locked = true; disableButtons();
      status.textContent = 'Time is up. Waiting for the next question.';
    }
  }
  tick(); countdown = setInterval(tick, 100);
});
socket.on('questionClosed', data => {
  if (data.questionId !== activeQuestion) return;
  locked = true; disableButtons();
  for (const button of options.querySelectorAll('button')) if (button.textContent === data.answer) button.classList.add('reveal-correct');
});
socket.on('quizEnd', scores => {
  quizInProgress = false;
  clearInterval(countdown); locked = true; activeQuestion = null; disableButtons();
  try { sessionStorage.setItem('quizResults', JSON.stringify(scores)); }
  catch { status.textContent = 'The quiz finished, but browser storage is unavailable. Ask the host for your results.'; return; }
  window.location.href = '/results.html';
});
