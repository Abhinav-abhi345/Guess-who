const express = require('express');
const http = require('node:http');
const { Server } = require('socket.io');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const dataFile = process.env.DATA_FILE || path.join(__dirname, 'details.json');
const resultsFile = process.env.RESULTS_FILE || path.join(__dirname, 'quiz-results.json');
const duration = Number(process.env.QUESTION_DURATION_MS || 15000);
if (!Number.isSafeInteger(duration) || duration < 250 || duration > 300000) throw new Error('QUESTION_DURATION_MS must be an integer between 250 and 300000');
app.use(express.json({ limit: '32kb' }));
app.get('/health', (req, res) => res.set('Cache-Control', 'no-store').json({ app: 'guess-who', protocolVersion: 2 }));
app.use(express.static(process.env.PUBLIC_DIR || path.join(__dirname, 'public'), {
  setHeaders(res, filename) {
    if (/\.(html|js|css)$/.test(filename)) res.set('Cache-Control', 'no-cache');
  }
}));
function readData() {
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  if (!data || !Array.isArray(data.details)) throw new Error('Invalid details file');
  return data;
}
function readResults() {
  if (!fs.existsSync(resultsFile)) return [];
  const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
  if (!Array.isArray(results)) throw new Error('Invalid results file');
  return results;
}
function writeJSON(filename, data) {
  const temporary = filename + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
    fs.renameSync(temporary, filename);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function validImage(value) {
  if (typeof value !== 'string' || value.length > 2048 || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}
function validatePerson(body) {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { body: 'Expected a JSON object.' };
  if (typeof body.answer !== 'string' || !body.answer.trim() || body.answer.trim().length > 120) errors.answer = 'Enter a name between 1 and 120 characters.';
  if (!['male', 'female'].includes(body.gender)) errors.gender = 'Select male or female.';
  for (const field of ['image1', 'image2']) if (!validImage(body[field])) errors[field] = 'Provide an absolute HTTP or HTTPS image URL without credentials.';
  return errors;
}
app.get('/details', (req, res) => res.json(readData().details));
app.post('/details', (req, res) => {
  const errors = validatePerson(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Please correct the invalid fields.', errors });
  const data = readData();
  const newEntry = { id: randomUUID(), answer: req.body.answer.trim(), image1: req.body.image1, image2: req.body.image2, gender: req.body.gender };
  data.details.push(newEntry);
  writeJSON(dataFile, data);
  res.status(201).json({ message: 'Data saved successfully', data: newEntry });
});
app.get('/admin/results', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(readResults());
});
// Compatible with existing numeric IDs and new UUIDs. Not invoked by regression tests.
app.delete('/details/:id', (req, res) => {
  const data = readData();
  const index = data.details.findIndex(item => String(item.id) === req.params.id);
  if (index < 0) return res.status(404).json({ message: 'Item not found' });
  const [deleted] = data.details.splice(index, 1);
  writeJSON(dataFile, data);
  res.json({ message: 'Item deleted successfully', deleted });
});
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Request body must be valid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request body is too large.' });
  console.error('Request failed:', err.code || err.name);
  res.status(500).json({ message: 'Unable to access application data. Please try again.' });
});
let timer;
let running = false;
let queue = [];
let people = [];
let current = null;
let roundId;
let finalResults = null;
const connected = new Map();
let participants = new Map();
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function publicQuestion() {
  return { questionId: current.id, question: { image1: current.person.image1, options: current.options }, time: Math.max(0, Math.ceil((current.deadline - Date.now()) / 1000)), deadline: current.deadline, durationMs: duration };
}
function finishQuiz() {
  running = false;
  current = null;
  finalResults = Object.fromEntries([...participants].map(([id, user]) => [id, { ...user }]));
  try {
    const history = readResults();
    history.push({ id: roundId, completedAt: new Date().toISOString(), results: finalResults });
    writeJSON(resultsFile, history);
  } catch {
    io.emit('quizError', { message: 'The quiz finished, but its report could not be saved. Player results are still available.' });
  }
  io.emit('quizEnd', finalResults);
}
function nextQuestion() {
  if (!running) return;
  if (current) io.emit('questionClosed', { questionId: current.id, answer: current.person.answer, image2: current.person.image2 });
  if (!queue.length) return finishQuiz();
  const person = queue.shift();
  const sameGender = people.filter(p => p.gender === person.gender && p.answer !== person.answer);
  const wrong = sameGender.length >= 3 ? sameGender : people.filter(p => p.answer !== person.answer);
  current = { id: randomUUID(), person, options: shuffle([person.answer, ...shuffle(wrong).slice(0, 3).map(p => p.answer)]), answered: new Set(), deadline: Date.now() + duration };
  io.emit('newQuestion', publicQuestion());
  timer = setTimeout(nextQuestion, duration);
}
io.on('connection', socket => {
  socket.on('registerUser', (username, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (typeof username !== 'string' || !username.trim() || username.trim().length > 120) return reply({ ok: false, message: 'Enter a username between 1 and 120 characters.' });
    if (!connected.has(socket.id)) connected.set(socket.id, username.trim());
    if (running && !participants.has(socket.id)) participants.set(socket.id, { username: connected.get(socket.id), score: 0 });
    reply({ ok: true });
    socket.emit('quizState', { state: running ? 'running' : 'waiting' });
    if (running && current) socket.emit('newQuestion', publicQuestion());
  });
  socket.on('startQuiz', ack => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (running) return reply({ ok: false, message: 'A quiz is already running.' });
    try {
      const records = readData().details;
      people = [...new Map(records.filter(p => !Object.keys(validatePerson(p)).length).map(p => [p.answer, { ...p }])).values()];
      if (people.length < 4) {
        const message = 'Add at least 4 valid people with distinct names before starting a quiz.';
        socket.emit('quizError', { message });
        return reply({ ok: false, message });
      }
    } catch {
      const message = 'Unable to load quiz data. Please try again.';
      socket.emit('quizError', { message });
      return reply({ ok: false, message });
    }
    clearTimeout(timer);
    participants = new Map([...connected].map(([id, username]) => [id, { username, score: 0 }]));
    queue = shuffle(people);
    current = null;
    finalResults = null;
    roundId = randomUUID();
    running = true;
    reply({ ok: true });
    nextQuestion();
  });
  socket.on('submitAnswer', (submission, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!running || !current || Date.now() >= current.deadline) return reply({ ok: false, message: 'This question has ended.' });
    if (!participants.has(socket.id)) return reply({ ok: false, message: 'Please join the quiz first.' });
    if (!submission || submission.questionId !== current.id || typeof submission.answer !== 'string' || !current.options.includes(submission.answer)) return reply({ ok: false, message: 'Invalid or expired question.' });
    if (current.answered.has(socket.id)) return reply({ ok: false, message: 'Your answer has already been recorded.' });
    current.answered.add(socket.id);
    const correct = submission.answer === current.person.answer;
    if (correct) participants.get(socket.id).score += 1;
    reply({ ok: true, correct, image2: current.person.image2, questionId: current.id });
  });
  socket.on('getResults', () => { if (finalResults) socket.emit('quizResults', finalResults); });
  socket.on('disconnect', () => connected.delete(socket.id));
});
server.listen(Number(process.env.PORT || 3000), () => console.log(`Server running on port ${server.address().port}`));
