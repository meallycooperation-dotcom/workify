(function() {
      // ---------- STORAGE KEYS ----------
      const STORAGE_ITEMS = 'blog_canvas_items';
      const STORAGE_STORY = 'blog_workspace_story';
      const STORAGE_ZOOM = 'blog_workspace_zoom';

      // ---------- DOM ELEMENTS ----------
      const canvasContainer = document.getElementById('infiniteCanvas');
      const dropZone = document.getElementById('canvasDropZone');
      const uploadImageBtn = document.getElementById('uploadImageBtn');
      const uploadVideoBtn = document.getElementById('uploadVideoBtn');
      const addStickyBtn = document.getElementById('addStickyNoteBtn');
      const clearCanvasBtn = document.getElementById('clearCanvasBtn');
      const imageFileInput = document.getElementById('imageFileInput');
      const videoFileInput = document.getElementById('videoFileInput');
      const storyTextarea = document.getElementById('storyTextarea');
      const manualSaveBtn = document.getElementById('manualSaveBtn');
      const saveStatus = document.getElementById('saveStatus');
      const lastSavedText = document.getElementById('lastSavedText');
      const zoomInBtn = document.getElementById('zoomInBtn');
      const zoomOutBtn = document.getElementById('zoomOutBtn');
      const zoomResetBtn = document.getElementById('zoomResetBtn');
      const zoomLevelDisplay = document.getElementById('zoomLevel');
      const selectAllTextBtn = document.getElementById('selectAllTextBtn');
      const voiceRecordBtn = document.getElementById('voiceRecordBtn');

      // ---------- STATE ----------
      let items = [];            // unified array: { id, type, x, y, width, height, src, content }
      let storyContent = '';
      let currentZoom = 1;
      const MIN_ZOOM = 0.2;
      const MAX_ZOOM = 3;
      const ZOOM_STEP = 0.1;

      // Drag state
      let draggedElement = null;
      let dragOffsetX = 0, dragOffsetY = 0;
      let currentDragId = null;

      // Voice recording state
      let mediaRecorder = null;
      let audioChunks = [];
      let isRecording = false;

      // ---------- UTILS ----------
      function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
      }

      function formatTime() {
        const now = new Date();
        return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }

      function updateZoomDisplay() {
        zoomLevelDisplay.textContent = Math.round(currentZoom * 100) + '%';
      }

      function applyZoom() {
        dropZone.style.transform = `scale(${currentZoom})`;
        updateZoomDisplay();
        try {
          localStorage.setItem(STORAGE_ZOOM, currentZoom.toString());
        } catch (e) {}
      }

      function setZoom(newZoom) {
        currentZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
        applyZoom();
      }

      // ---------- LOCAL STORAGE OPERATIONS ----------
      function saveItemsToStorage() {
        try {
          localStorage.setItem(STORAGE_ITEMS, JSON.stringify(items));
        } catch (e) {
          console.warn('Failed to save items', e);
        }
      }

      function loadItemsFromStorage() {
        try {
          const stored = localStorage.getItem(STORAGE_ITEMS);
          if (stored) {
            items = JSON.parse(stored);
          } else {
            items = [];
          }
        } catch (e) {
          items = [];
        }
      }

      function saveStoryToStorage() {
        try {
          localStorage.setItem(STORAGE_STORY, storyContent);
          updateSaveIndicator(true);
        } catch (e) {}
      }

      function loadStoryFromStorage() {
        try {
          const stored = localStorage.getItem(STORAGE_STORY);
          storyContent = stored || '';
          storyTextarea.value = storyContent;
        } catch (e) {
          storyContent = '';
          storyTextarea.value = '';
        }
      }

      function loadZoomFromStorage() {
        try {
          const saved = localStorage.getItem(STORAGE_ZOOM);
          if (saved) {
            const parsed = parseFloat(saved);
            if (!isNaN(parsed) && parsed >= MIN_ZOOM && parsed <= MAX_ZOOM) {
              currentZoom = parsed;
            }
          }
        } catch (e) {}
        applyZoom();
      }

      function updateSaveIndicator(justSaved = false) {
        if (justSaved) {
          saveStatus.innerHTML = '<i class="fas fa-check-circle"></i> saved';
          lastSavedText.textContent = `saved ${formatTime()}`;
        } else {
          saveStatus.innerHTML = '📁 local';
        }
      }

      // ---------- RENDER CANVAS ITEMS ----------
      function renderAllItems() {
        dropZone.innerHTML = '';

        items.forEach(item => {
          const wrapper = document.createElement('div');
          wrapper.className = 'canvas-item';
          wrapper.setAttribute('data-id', item.id);
          wrapper.style.left = item.x + 'px';
          wrapper.style.top = item.y + 'px';
          wrapper.style.width = item.width + 'px';
          wrapper.style.height = item.height + 'px';

          if (item.type === 'image') {
            const img = document.createElement('img');
            img.src = item.src;
            img.alt = 'canvas image';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';
            img.style.pointerEvents = 'none';
            wrapper.appendChild(img);
          } else if (item.type === 'video') {
            const video = document.createElement('video');
            video.src = item.src;
            video.className = 'canvas-video';
            video.controls = true;
            video.loop = true;
            video.muted = true;
            video.style.pointerEvents = 'auto';
            wrapper.appendChild(video);
          } else if (item.type === 'sticky') {
            wrapper.classList.add('sticky-note');
            wrapper.setAttribute('contenteditable', 'true');
            wrapper.innerHTML = item.content || '📝 double-click to edit';
            wrapper.style.background = '#fef9c3';
            wrapper.style.color = '#1e1e2e';
            wrapper.style.fontSize = '16px';
            wrapper.addEventListener('input', (e) => {
              const id = wrapper.getAttribute('data-id');
              const targetItem = items.find(i => i.id === id);
              if (targetItem) {
                targetItem.content = wrapper.innerText || wrapper.textContent;
                saveItemsToStorage();
              }
            });
            wrapper.addEventListener('blur', () => saveItemsToStorage());
          }

          // Delete button
          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'delete-item-btn';
          deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
          deleteBtn.setAttribute('data-id', item.id);
          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteItemById(item.id);
          });
          wrapper.appendChild(deleteBtn);

          // Drag events
          wrapper.addEventListener('mousedown', onItemMouseDown);
          wrapper.addEventListener('touchstart', onItemTouchStart, { passive: false });

          dropZone.appendChild(wrapper);
        });
      }

      function deleteItemById(id) {
        items = items.filter(item => item.id !== id);
        saveItemsToStorage();
        renderAllItems();
      }

      function addItemToCanvas(itemData) {
        const canvasRect = canvasContainer.getBoundingClientRect();
        const scrollLeft = canvasContainer.scrollLeft;
        const scrollTop = canvasContainer.scrollTop;
        const centerX = scrollLeft + canvasRect.width / 2 - itemData.width / 2 + (Math.random() * 60 - 30);
        const centerY = scrollTop + canvasRect.height / 2 - itemData.height / 2 + (Math.random() * 60 - 30);
        
        const newItem = {
          id: generateId(),
          ...itemData,
          x: Math.max(0, Math.round(centerX)),
          y: Math.max(0, Math.round(centerY)),
        };
        items.push(newItem);
        saveItemsToStorage();
        renderAllItems();
      }

      function addImageFromFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          const src = e.target.result;
          const tempImg = new Image();
          tempImg.onload = () => {
            const MAX_SIZE = 280;
            let w = tempImg.naturalWidth;
            let h = tempImg.naturalHeight;
            if (w >= h) {
              w = Math.min(w, MAX_SIZE);
              h = (tempImg.naturalHeight / tempImg.naturalWidth) * w;
            } else {
              h = Math.min(h, MAX_SIZE);
              w = (tempImg.naturalWidth / tempImg.naturalHeight) * h;
            }
            addItemToCanvas({ type: 'image', src, width: Math.round(w), height: Math.round(h) });
          };
          tempImg.src = src;
        };
        reader.readAsDataURL(file);
      }

      function addVideoFromFile(file) {
        if (!file || !file.type.startsWith('video/')) return;
        const url = URL.createObjectURL(file);
        addItemToCanvas({ type: 'video', src: url, width: 320, height: 240 });
      }

      function addStickyNote() {
        addItemToCanvas({ type: 'sticky', content: '✨ new note', width: 180, height: 120 });
      }

      function handleImageFiles(files) {
        if (!files || files.length === 0) return;
        Array.from(files).forEach(file => addImageFromFile(file));
      }

      function handleVideoFiles(files) {
        if (!files || files.length === 0) return;
        Array.from(files).forEach(file => addVideoFromFile(file));
      }

      function clearAllItems() {
        if (items.length === 0) return;
        if (confirm('Remove all items from canvas? This cannot be undone.')) {
          items = [];
          saveItemsToStorage();
          renderAllItems();
        }
      }

      // ---------- DRAGGING (works for all item types) ----------
      function getCanvasRelativeCoords(e) {
        const dropZoneRect = dropZone.getBoundingClientRect();
        let clientX, clientY;
        if (e.touches) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else {
          clientX = e.clientX;
          clientY = e.clientY;
        }
        const x = (clientX - dropZoneRect.left) / currentZoom;
        const y = (clientY - dropZoneRect.top) / currentZoom;
        return { x, y };
      }

      function onItemMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();
        startDrag(e.currentTarget, e);
      }

      function onItemTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
          startDrag(e.currentTarget, e.touches[0]);
        }
      }

      function startDrag(element, eventOrTouch) {
        draggedElement = element;
        currentDragId = element.getAttribute('data-id');
        const item = items.find(i => i.id === currentDragId);
        if (!item) return;
        const coords = getCanvasRelativeCoords(eventOrTouch);
        dragOffsetX = coords.x - item.x;
        dragOffsetY = coords.y - item.y;
        element.classList.add('dragging');
        window.addEventListener('mousemove', onDragMove);
        window.addEventListener('mouseup', onDragEnd);
        window.addEventListener('touchmove', onDragMove, { passive: false });
        window.addEventListener('touchend', onDragEnd);
        window.addEventListener('touchcancel', onDragEnd);
      }

      function onDragMove(e) {
        if (!draggedElement || !currentDragId) return;
        e.preventDefault();
        const item = items.find(i => i.id === currentDragId);
        if (!item) { stopDrag(); return; }
        const coords = getCanvasRelativeCoords(e);
        let newX = coords.x - dragOffsetX;
        let newY = coords.y - dragOffsetY;
        newX = Math.max(-60, newX);
        newY = Math.max(-60, newY);
        item.x = newX;
        item.y = newY;
        draggedElement.style.left = newX + 'px';
        draggedElement.style.top = newY + 'px';
      }

      function onDragEnd() {
        stopDrag();
        if (currentDragId) saveItemsToStorage();
      }

      function stopDrag() {
        if (draggedElement) draggedElement.classList.remove('dragging');
        window.removeEventListener('mousemove', onDragMove);
        window.removeEventListener('mouseup', onDragEnd);
        window.removeEventListener('touchmove', onDragMove);
        window.removeEventListener('touchend', onDragEnd);
        window.removeEventListener('touchcancel', onDragEnd);
        draggedElement = null;
        currentDragId = null;
      }

      // ---------- ZOOM & PAN (mouse wheel, pinch) ----------
      function setupZoomAndPan() {
        canvasContainer.addEventListener('wheel', (e) => {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
          setZoom(currentZoom + delta);
        }, { passive: false });

        zoomInBtn.addEventListener('click', () => setZoom(currentZoom + ZOOM_STEP));
        zoomOutBtn.addEventListener('click', () => setZoom(currentZoom - ZOOM_STEP));
        zoomResetBtn.addEventListener('click', () => setZoom(1));

        let initialPinchDistance = 0;
        let initialZoom = 1;
        canvasContainer.addEventListener('touchstart', (e) => {
          if (e.touches.length === 2) {
            initialPinchDistance = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
            );
            initialZoom = currentZoom;
          }
        }, { passive: false });
        canvasContainer.addEventListener('touchmove', (e) => {
          if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
            );
            setZoom(initialZoom * (dist / initialPinchDistance));
          }
        }, { passive: false });
      }

      // ---------- DROP UPLOAD ----------
      function setupCanvasDrop() {
        canvasContainer.addEventListener('dragover', e => e.preventDefault());
        canvasContainer.addEventListener('drop', (e) => {
          e.preventDefault();
          const files = e.dataTransfer?.files;
          if (files && files.length) {
            Array.from(files).forEach(f => {
              if (f.type.startsWith('image/')) addImageFromFile(f);
              else if (f.type.startsWith('video/')) addVideoFromFile(f);
            });
          }
        });
        document.body.addEventListener('dragover', e => e.preventDefault());
        document.body.addEventListener('drop', (e) => {
          e.preventDefault();
          if (!canvasContainer.contains(e.target)) {
            const files = e.dataTransfer?.files;
            if (files) Array.from(files).forEach(f => {
              if (f.type.startsWith('image/')) addImageFromFile(f);
              else if (f.type.startsWith('video/')) addVideoFromFile(f);
            });
          }
        });
      }

      // ---------- STORY & VOICE ----------
      function onStoryInput() {
        storyContent = storyTextarea.value;
        clearTimeout(window.storySaveTimeout);
        window.storySaveTimeout = setTimeout(() => saveStoryToStorage(), 600);
      }

      function manualSave() {
        storyContent = storyTextarea.value;
        saveStoryToStorage();
        lastSavedText.textContent = `saved ${formatTime()}`;
        saveStatus.innerHTML = '<i class="fas fa-check-circle"></i> saved';
        setTimeout(() => { saveStatus.innerHTML = '📁 local'; }, 1500);
      }

      function selectAllStoryText() {
        storyTextarea.focus();
        storyTextarea.select();
      }

      async function toggleVoiceRecording() {
        if (!isRecording) {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Voice recording not supported in this browser.');
            return;
          }
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.ondataavailable = e => {
              if (e.data.size > 0) audioChunks.push(e.data);
            };
            mediaRecorder.onstop = () => {
              const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
              const audioUrl = URL.createObjectURL(audioBlob);
              const audio = new Audio(audioUrl);
              audio.controls = true;
              // Append audio player as a sticky-like note or just play? Better: create a sticky note with audio.
              const noteContent = `<i class="fas fa-volume-up"></i> voice note (click play)<br/><audio controls src="${audioUrl}" style="width:100%; margin-top:6px;"></audio>`;
              addItemToCanvas({ type: 'sticky', content: noteContent, width: 220, height: 130 });
              stream.getTracks().forEach(track => track.stop());
            };
            mediaRecorder.start();
            isRecording = true;
            voiceRecordBtn.classList.add('recording');
            voiceRecordBtn.innerHTML = '<i class="fas fa-stop-circle"></i> stop';
          } catch (err) {
            alert('Microphone access denied.');
          }
        } else {
          if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
          isRecording = false;
          voiceRecordBtn.classList.remove('recording');
          voiceRecordBtn.innerHTML = '<i class="fas fa-microphone"></i> record';
        }
      }

      // ---------- INITIALIZE ----------
      function bootstrap() {
        loadItemsFromStorage();
        loadStoryFromStorage();
        loadZoomFromStorage();
        renderAllItems();

        storyTextarea.value = storyContent;
        storyTextarea.addEventListener('input', onStoryInput);
        manualSaveBtn.addEventListener('click', manualSave);
        selectAllTextBtn.addEventListener('click', selectAllStoryText);
        voiceRecordBtn.addEventListener('click', toggleVoiceRecording);

        uploadImageBtn.addEventListener('click', () => imageFileInput.click());
        imageFileInput.addEventListener('change', (e) => {
          handleImageFiles(e.target.files);
          imageFileInput.value = '';
        });

        uploadVideoBtn.addEventListener('click', () => videoFileInput.click());
        videoFileInput.addEventListener('change', (e) => {
          handleVideoFiles(e.target.files);
          videoFileInput.value = '';
        });

        addStickyBtn.addEventListener('click', addStickyNote);
        clearCanvasBtn.addEventListener('click', clearAllItems);

        setupCanvasDrop();
        setupZoomAndPan();

        window.addEventListener('beforeunload', () => {
          saveStoryToStorage();
        });

        updateSaveIndicator(false);
        lastSavedText.textContent = 'auto-save on';
      }

      bootstrap();
    })();