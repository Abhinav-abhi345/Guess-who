const form = document.getElementById('upload');
const nameInput = document.getElementById('name');
const genderInput = document.getElementById('gender');
const fileInput = document.getElementById('file');
const submit = document.getElementById('submit');
const status = document.getElementById('saveStatus');
let saving = false;
function message(text, error = false) {
  status.textContent = text;
  status.setAttribute('role', error ? 'alert' : 'status');
}
async function uploadImage(file) {
  const data = new FormData();
  data.append('file', file);
  data.append('upload_preset', 'my_upload_preset');
  data.append('folder', 'uploads');
  let response;
  try {
    response = await fetch('https://api.cloudinary.com/v1_1/dbompxovn/image/upload', { method: 'POST', body: data, signal: AbortSignal.timeout(30000) });
  } catch { throw new Error('Image upload failed. Check your connection and select Submit to retry.'); }
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.secure_url !== 'string') throw new Error('Image upload failed. Please select Submit to retry.');
  try { if (!['https:', 'http:'].includes(new URL(body.secure_url).protocol)) throw new Error(); }
  catch { throw new Error('The upload service returned an invalid image URL. Please retry.'); }
  return body.secure_url;
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (saving) return;
  const answer = nameInput.value.trim();
  const gender = genderInput.value;
  const files = [...fileInput.files];
  if (!answer || answer.length > 120) return message('Please enter a name between 1 and 120 characters.', true);
  if (!['male', 'female'].includes(gender)) return message('Please select gender.', true);
  if (files.length !== 2) return message('Please select exactly 2 images.', true);
  if (files.some(f => !['image/png', 'image/jpeg'].includes(f.type) || f.size > 10 * 1024 * 1024)) return message('Select PNG or JPEG images, each no larger than 10 MB.', true);
  saving = true;
  submit.disabled = true;
  form.setAttribute('aria-busy', 'true');
  // Freeze the submitted fields so success cannot erase edits made during an upload.
  for (const input of [nameInput, genderInput, fileInput]) input.disabled = true;
  message('Uploading images and saving...');
  try {
    const [image1, image2] = await Promise.all(files.map(uploadImage));
    const response = await fetch('/details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer, gender, image1, image2 }), signal: AbortSignal.timeout(30000) });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || 'Unable to save this person. Please retry.');
    if (!body || typeof body.message !== 'string') throw new Error('The server returned an invalid response. Please check View Details before retrying.');
    form.reset();
    message('Person added successfully! Open View Details to see the saved person.');
  } catch (error) {
    message(error.name === 'TimeoutError' ? 'Saving timed out. Check View Details before retrying.' : error.message || 'Unable to save. Please retry.', true);
  } finally {
    saving = false;
    submit.disabled = false;
    for (const input of [nameInput, genderInput, fileInput]) input.disabled = false;
    form.removeAttribute('aria-busy');
  }
});
