const stage = document.getElementById('imageStage');
const imgEl = document.getElementById('cropImage');
const selectionBox = document.getElementById('selectionBox');
const confirmBtn = document.getElementById('confirmCropBtn');
const cancelBtn = document.getElementById('cancelCropBtn');
const resetBtn = document.getElementById('resetSelectionBtn');
const hintEl = document.querySelector('.hint');

let cropData = null; // { noteId, image }
let imageReady = false;
let dragging = false;
let startX, startY;
let selection = null; // in client coords relative to the image + its own size

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

chrome.storage.local.get(['cropPending'], (result) => {
  cropData = result.cropPending;
  if (!cropData) {
    hintEl.textContent = 'No screenshot to crop — close this window and try again.';
    return;
  }
  imgEl.src = cropData.image;
});

imgEl.addEventListener('load', () => {
  imageReady = true;
});

function getRects() {
  return { img: imgEl.getBoundingClientRect(), stage: stage.getBoundingClientRect() };
}

stage.addEventListener('mousedown', (e) => {
  if (!imageReady) return;
  const { img } = getRects();
  if (e.clientX < img.left || e.clientX > img.right || e.clientY < img.top || e.clientY > img.bottom) return;

  dragging = true;
  startX = clamp(e.clientX, img.left, img.right);
  startY = clamp(e.clientY, img.top, img.bottom);
  selectionBox.classList.remove('hidden');
  confirmBtn.disabled = true;
  updateSelectionBox(startX, startY, startX, startY);
});

window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const { img } = getRects();
  const curX = clamp(e.clientX, img.left, img.right);
  const curY = clamp(e.clientY, img.top, img.bottom);
  updateSelectionBox(startX, startY, curX, curY);
});

window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  if (selection && selection.widthClient > 5 && selection.heightClient > 5) {
    confirmBtn.disabled = false;
  }
});

function updateSelectionBox(x1, y1, x2, y2) {
  const { img, stage: stageRect } = getRects();
  const leftClient = Math.min(x1, x2);
  const topClient = Math.min(y1, y2);
  const widthClient = Math.abs(x2 - x1);
  const heightClient = Math.abs(y2 - y1);

  selectionBox.style.left = `${leftClient - stageRect.left}px`;
  selectionBox.style.top = `${topClient - stageRect.top}px`;
  selectionBox.style.width = `${widthClient}px`;
  selectionBox.style.height = `${heightClient}px`;

  selection = {
    leftInImg: leftClient - img.left,
    topInImg: topClient - img.top,
    widthClient,
    heightClient,
  };
}

resetBtn.addEventListener('click', () => {
  selectionBox.classList.add('hidden');
  selection = null;
  confirmBtn.disabled = true;
});

cancelBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove('cropPending');
  window.close();
});

confirmBtn.addEventListener('click', async () => {
  if (!selection || !cropData) return;

  const scaleX = imgEl.naturalWidth / imgEl.clientWidth;
  const scaleY = imgEl.naturalHeight / imgEl.clientHeight;

  const sx = selection.leftInImg * scaleX;
  const sy = selection.topInImg * scaleY;
  const sw = selection.widthClient * scaleX;
  const sh = selection.heightClient * scaleY;

  try {
    const fullImg = await loadImage(cropData.image);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(fullImg, sx, sy, sw, sh, 0, 0, sw, sh);

    const croppedDataUrl = canvas.toDataURL('image/png');

    const { notes } = await chrome.storage.local.get(['notes']);
    const list = notes || [];
    const note = list.find((n) => n.id === cropData.noteId);
    if (note) {
      note.image = croppedDataUrl;
      note.updatedAt = Date.now();
      await chrome.storage.local.set({ notes: list });
    }

    await chrome.storage.local.set({ pendingOpenNoteId: cropData.noteId });
    await chrome.storage.local.remove('cropPending');
    window.close();
  } catch (err) {
    console.error('Crop save failed:', err);
    hintEl.textContent = 'Something went wrong saving the crop — try again.';
  }
});
