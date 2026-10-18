(() => {
  const song = document.querySelector('#song');
  const stage = document.querySelector('#stage');
  const lanes = document.querySelector('#lanes');
  const startButton = document.querySelector('#startBtn');
  const keys = ['d', 'f', 'j', 'k'];
  const bpm = 128;
  const beat = 60 / bpm;
  // Lane centers and widths follow the four trapezoids drawn by the SVG grid.
  const nearCentres = [15.5, 38.5, 61.5, 84.5];
  const farCentres = [33.5, 44.5, 55.5, 66.5];
  const nearLaneWidths = [23, 23, 23, 23];
  const farLaneWidths = [11, 11, 11, 11];
  // Keep the judgement line in the visible upper portion of the tall desktop playfield.
  const hitY = () => stage.clientHeight * 0.78;
  // Faster travel gives the larger notes enough room, including half-beat patterns.
  const approachTime = () => 1.3 * 6 / Number(document.querySelector('#speed').value);

  let chart = [];
  let laneReadyAt = [-Infinity, -Infinity, -Infinity, -Infinity];
  let active = false;
  let paused = false;
  let previewing = false;
  let animation = 0;
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let hits = 0;
  let misses = 0;
  let lastBeat = -1;
  let judgeTimeout;
  let flashTimeout;
  const heldLanes = new Set();

  const formatTime = value => {
    const seconds = Math.max(0, Math.floor(value || 0));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };

  function updateStats() {
    document.querySelector('#score').textContent = String(score).padStart(6, '0');
    document.querySelector('#combo').textContent = combo;
    const stageCombo = document.querySelector('#stageCombo');
    document.querySelector('#stageComboValue').textContent = combo;
    stageCombo.classList.toggle('visible', combo > 0);
    if (combo > 0) {
      stageCombo.classList.remove('combo-pop');
      requestAnimationFrame(() => stageCombo.classList.add('combo-pop'));
    } else {
      stageCombo.classList.remove('combo-pop');
    }
    document.querySelector('#maxCombo').textContent = maxCombo;
    const total = hits + misses;
    document.querySelector('#accuracy').textContent = `${(total ? hits / total * 100 : 100).toFixed(1)}%`;
    document.querySelector('#comboMeter').style.width = `${Math.min(100, combo * 3)}%`;
  }

  function makeChart() {
    chart.forEach(note => note.element.remove());
    chart = [];
    if (!Number.isFinite(song.duration)) return;

    const difficulty = document.querySelector('#difficulty').value;
    // Main notes land on beats; later sections add half-beat pickups and chords.
    const duration = song.duration;
    const pattern = difficulty === 'hard'
      ? [0, 2, 1, 3, 2, 0, 3, 1]
      : difficulty === 'easy'
        ? [0, 2, 1, 3]
        : [0, 1, 3, 2, 1, 0, 2, 3];

    let index = 0;
    let holdIndex = 0;
    const holdUntil = [0, 0, 0, 0];
    laneReadyAt = [-Infinity, -Infinity, -Infinity, -Infinity];
    const firstBeat = Math.ceil(approachTime() / beat);
    const beatStep = difficulty === 'easy' ? 2 : 1;
    for (let beatIndex = firstBeat; beatIndex * beat < duration - 0.15; beatIndex += beatStep) {
      const time = beatIndex * beat;
      const patternLane = pattern[index % pattern.length];
      const holdEvery = difficulty === 'easy' ? 6 : difficulty === 'normal' ? 8 : 10;
      const isHold = index > 0 && index % holdEvery === 0;
      const progress = time / duration;
      const ramp = difficulty === 'easy'
        ? (progress < 0.35 ? 0.08 : progress < 0.7 ? 0.18 : 0.3)
        : difficulty === 'hard'
          ? (progress < 0.25 ? 0.32 : progress < 0.6 ? 0.52 : 0.72)
          : (progress < 0.3 ? 0.12 : progress < 0.65 ? 0.3 : 0.5);
      const pairChance = difficulty === 'easy' ? 0.08 + ramp * 0.35 : ramp;
      const pairHold = isHold && Math.random() < pairChance;
      // Long notes rotate through all four lanes instead of repeating on one side.
      const preferredLane = isHold ? holdIndex % 4 : patternLane;
      const findFreeLane = (preferred, noteTime = time) => {
        for (let offset = 0; offset < 4; offset += 1) {
          const candidate = (preferred + offset) % 4;
          if (noteTime >= holdUntil[candidate] && noteTime >= laneReadyAt[candidate]) return candidate;
        }
        return null;
      };
      const lane = findFreeLane(preferredLane);
      if (lane !== null) {
        const length = beat * 3;
        addNote(time, lane, isHold ? length : 0);
        // Leave the lane clear for one full beat after the hold tail so it never asks for a second tap at the endpoint.
        if (isHold) holdUntil[lane] = time + length + beat;
        if (isHold) holdIndex += 1;
        if (pairHold) {
          const secondLane = findFreeLane((lane + 1 + Math.floor(Math.random() * 3)) % 4);
          if (secondLane !== null && secondLane !== lane) {
            addNote(time, secondLane, length);
            holdUntil[secondLane] = time + length + beat;
            holdIndex += 1;
          }
        }
        if (!isHold && difficulty === 'hard' && index % 4 === 3) {
          const chordLane = findFreeLane((lane + 2) % 4);
          if (chordLane !== null && chordLane !== lane) addNote(time, chordLane);
        }

        // Add half-beat pickups more often as the song progresses, with occasional chords.
        const offbeatChance = difficulty === 'easy'
          ? (progress < 0.35 ? 0 : progress < 0.7 ? 0.12 : 0.24)
          : difficulty === 'hard'
            ? (progress < 0.25 ? 0.18 : progress < 0.6 ? 0.38 : 0.58)
            : (progress < 0.3 ? 0.05 : progress < 0.65 ? 0.22 : 0.4);
        if (!isHold && time + beat / 2 < duration - 0.15 && Math.random() < offbeatChance) {
          const offbeatTime = time + beat / 2;
          const extraLane = findFreeLane((lane + 1 + Math.floor(Math.random() * 3)) % 4, offbeatTime);
          if (extraLane !== null) addNote(offbeatTime, extraLane);
          const chordChance = difficulty === 'hard' ? 0.2 + progress * 0.28 : 0.04 + progress * 0.16;
          if (extraLane !== null && Math.random() < chordChance) {
            const chordLane = findFreeLane((extraLane + 1 + Math.floor(Math.random() * 3)) % 4, offbeatTime);
            if (chordLane !== null) addNote(offbeatTime, chordLane);
          }
        }
      }
      index += 1;
    }
  }

  function addNote(time, lane, holdDuration = 0) {
    if (time >= song.duration) return;
    const noteHeight = window.matchMedia('(min-width: 801px)').matches ? 44 : 30;
    const minGap = ((noteHeight + 24) * approachTime()) / (hitY() + 12);
    if (time < laneReadyAt[lane]) return;
    const element = document.createElement('div');
    element.className = `note lane-${lane}${holdDuration ? ' hold-note' : ''}`;
    element.setAttribute('aria-hidden', 'true');
    lanes.append(element);
    chart.push({ time, lane, element, holdDuration, state: 'pending' });
    laneReadyAt[lane] = time + (holdDuration ? holdDuration + beat : minGap);
  }

  function showJudgment(label, color) {
    const element = document.querySelector('#judgment');
    element.textContent = label;
    element.style.color = color;
    element.classList.add('show');
    clearTimeout(judgeTimeout);
    judgeTimeout = setTimeout(() => element.classList.remove('show'), 360);
    const flash = document.querySelector('#hitFlash');
    flash.classList.remove('active');
    requestAnimationFrame(() => flash.classList.add('active'));
    clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => flash.classList.remove('active'), 360);
  }

  function pulseHitLine() {
    const hitLine = document.querySelector('.hit-line');
    hitLine.classList.remove('pulse');
    requestAnimationFrame(() => hitLine.classList.add('pulse'));
  }

  function pressLane(lane) {
    const button = document.querySelector(`.lane-keys button[data-lane="${lane}"]`);
    button?.classList.add('active');
    if (!active || paused) return;

    const now = song.currentTime;
    let nearest = null;
    let distance = Infinity;
    for (const note of chart) {
      if (note.state !== 'pending' || note.lane !== lane) continue;
      const delta = Math.abs(note.time - now);
      if (delta < distance) { nearest = note; distance = delta; }
    }
    if (!nearest || distance > 0.19) {
      showJudgment('空拍', '#d6bbba');
      return;
    }

    if (nearest.holdDuration) {
      nearest.state = 'holding';
      nearest.endTime = nearest.time + nearest.holdDuration;
      nearest.element.classList.add('is-held');
      pulseHitLine();
      showJudgment('HOLD!', '#fff0e7');
      return;
    }
    completeNote(nearest, distance);
  }

  function completeNote(note, distance = 0) {
    pulseHitLine();
    note.state = 'hit';
    note.element.remove();
    hits += 1;
    combo += 1;
    maxCombo = Math.max(combo, maxCombo);
    let points;
    if (distance <= 0.055) { points = 1000; showJudgment('PERFECT', '#fff0e7'); }
    else if (distance <= 0.11) { points = 700; showJudgment('GREAT', '#ffa1a9'); }
    else { points = 400; showJudgment('GOOD', '#f1c6a0'); }
    score += points + Math.max(0, combo - 1) * 10;
    updateStats();
  }

  function breakHold(note) {
    note.state = 'miss';
    note.element.remove();
    misses += 1;
    combo = 0;
    showJudgment('HOLD BREAK', '#f34f65');
    updateStats();
  }

  function placeNote(note, y, translateY = y, height = null) {
    // Match the SVG perspective rails across the full stage. Using the hit-line
    // as the depth endpoint made notes reach the widest lane too early and drift.
    const depthAt = position => Math.max(0, Math.min(1, position / stage.clientHeight));
    const xAt = depth => farCentres[note.lane] + (nearCentres[note.lane] - farCentres[note.lane]) * depth;
    const widthAt = depth => (farLaneWidths[note.lane] + (nearLaneWidths[note.lane] - farLaneWidths[note.lane]) * depth) * 0.92;
    const top = translateY;
    const bottom = translateY + (height ?? 13);
    if (height !== null) {
      // Shape the hold bar between the lane's far and near edges at its current depth.
      const topDepth = depthAt(top);
      const bottomDepth = depthAt(bottom);
      const topCentre = xAt(topDepth);
      const bottomCentre = xAt(bottomDepth);
      const topWidth = widthAt(topDepth);
      const bottomWidth = widthAt(bottomDepth);
      const left = Math.min(topCentre - topWidth / 2, bottomCentre - bottomWidth / 2);
      const right = Math.max(topCentre + topWidth / 2, bottomCentre + bottomWidth / 2);
      const boxWidth = right - left;
      const pct = value => `${((value - left) / boxWidth * 100).toFixed(2)}%`;
      note.element.style.left = `${(left + right) / 2}%`;
      note.element.style.width = `${boxWidth}%`;
      note.element.style.height = `${height}px`;
      note.element.style.transform = `translate(-50%, ${top}px)`;
      note.element.style.clipPath = `polygon(${pct(topCentre - topWidth / 2)} 0, ${pct(topCentre + topWidth / 2)} 0, ${pct(bottomCentre + bottomWidth / 2)} 100%, ${pct(bottomCentre - bottomWidth / 2)} 100%)`;
    } else {
      const depth = depthAt(y);
      const scale = 0.48 + 0.52 * depth;
      note.element.style.left = `${xAt(depth)}%`;
      note.element.style.width = `${widthAt(depth) / scale}%`;
      note.element.style.height = '';
      note.element.style.clipPath = '';
      // Scale note width with the runway, but keep note height fixed so the
      // beat-to-beat gaps stay visually even as notes approach the hit line.
      note.element.style.transform = `translate(-50%, ${y}px) scaleX(${scale})`;
    }
    const opacity = bottom < -24 || top > stage.clientHeight + 20 ? '0' : '1';
    if (note.element.style.opacity !== opacity) note.element.style.opacity = opacity;
  }

  function updateBeat(time) {
    const currentBeat = Math.floor(time / beat);
    if (currentBeat === lastBeat) return;
    lastBeat = currentBeat;
    document.querySelectorAll('.beat-indicator i').forEach((light, index) => {
      light.classList.toggle('on', index === currentBeat % 4);
    });
  }

  function finishGame() {
    active = false;
    paused = false;
    cancelAnimationFrame(animation);
    song.pause();
    document.querySelector('#pauseOverlay').classList.add('hidden');
    document.querySelector('#stageMessage').classList.remove('is-hidden');
    document.querySelector('#stageMessage b').textContent = '演奏完成！';
    document.querySelector('#stageMessage span').textContent = `SCORE ${String(score).padStart(6, '0')} · ${document.querySelector('#accuracy').textContent} ACC`;
    startButton.innerHTML = '<span>▶</span> PLAY AGAIN <i>01</i>';
  }

  function frame() {
    if (!active || paused) return;
    const now = song.currentTime;
    const distance = hitY() + 12;
    const travel = approachTime();

    for (const note of chart) {
      if (note.state === 'pending' && note.time - now > travel + 0.15) continue;
      if (note.state === 'holding') {
        if (!heldLanes.has(note.lane) && now < note.endTime - 0.03) {
          breakHold(note);
          continue;
        }
        const holdHeight = (note.holdDuration / travel) * distance;
        const y = hitY() - ((note.time - now) / travel) * distance;
        placeNote(note, y, y - holdHeight, holdHeight);
        if (now >= note.endTime) completeNote(note, 0);
        continue;
      }
      if (note.state !== 'pending') continue;
      const y = hitY() - ((note.time - now) / travel) * distance;
      const holdHeight = note.holdDuration ? (note.holdDuration / travel) * distance : null;
      placeNote(note, y, note.holdDuration ? y - holdHeight : y, holdHeight);
      if (now - note.time > 0.19) {
        note.state = 'miss';
        note.element.remove();
        misses += 1;
        combo = 0;
        showJudgment('MISS', '#f34f65');
        updateStats();
      }
    }

    updateBeat(now);
    document.querySelector('#songTime').textContent = `${formatTime(now)} / ${formatTime(song.duration)}`;
    if (song.ended || now >= song.duration) { finishGame(); return; }
    animation = requestAnimationFrame(frame);
  }

  async function startGame() {
    if (active && paused) { resumeGame(); return; }
    if (active) return;
    if (song.readyState < 1) {
      document.querySelector('#stageMessage b').textContent = '歌曲載入中…';
      song.addEventListener('loadedmetadata', startGame, { once: true });
      song.load();
      return;
    }

    makeChart();
    score = combo = maxCombo = hits = misses = 0;
    lastBeat = -1;
    updateStats();
    chart.forEach(note => { note.state = 'pending'; });
    song.currentTime = 0;
    document.querySelector('#stageMessage').classList.add('is-hidden');
    document.querySelector('#pauseOverlay').classList.add('hidden');
    startButton.innerHTML = '<span>Ⅱ</span> PLAYING <i>SPACE</i>';
    active = true;
    try {
      await song.play();
      animation = requestAnimationFrame(frame);
    } catch (error) {
      active = false;
      document.querySelector('#stageMessage').classList.remove('is-hidden');
      document.querySelector('#stageMessage b').textContent = '無法播放歌曲';
      document.querySelector('#stageMessage span').textContent = '請確認音檔已放在 assets 資料夾';
    }
  }

  function pauseGame() {
    if (!active || paused) return;
    paused = true;
    song.pause();
    cancelAnimationFrame(animation);
    document.querySelector('#pauseOverlay').classList.remove('hidden');
    startButton.innerHTML = '<span>▶</span> RESUME <i>SPACE</i>';
  }

  async function resumeGame() {
    if (!active || !paused) return;
    paused = false;
    document.querySelector('#pauseOverlay').classList.add('hidden');
    startButton.innerHTML = '<span>Ⅱ</span> PLAYING <i>SPACE</i>';
    try { await song.play(); animation = requestAnimationFrame(frame); }
    catch { pauseGame(); }
  }

  function resetGame() {
    active = false;
    paused = false;
    cancelAnimationFrame(animation);
    song.pause();
    song.currentTime = 0;
    chart.forEach(note => note.element.remove());
    chart = [];
    score = combo = maxCombo = hits = misses = 0;
    lastBeat = -1;
    updateStats();
    document.querySelector('#songTime').textContent = `00:00 / ${formatTime(song.duration)}`;
    document.querySelector('#pauseOverlay').classList.add('hidden');
    document.querySelector('#stageMessage').classList.remove('is-hidden');
    document.querySelector('#stageMessage b').textContent = 'Are you ready?';
    document.querySelector('#stageMessage span').textContent = 'PRESS START TO PLAY';
    document.querySelectorAll('.beat-indicator i').forEach(light => light.classList.remove('on'));
    startButton.innerHTML = '<span>▶</span> START GAME <i>01</i>';
    makeChart();
  }

  startButton.addEventListener('click', startGame);
  document.querySelector('#resetBtn').addEventListener('click', resetGame);
  document.querySelector('#speed').addEventListener('input', event => {
    document.querySelector('#speedLabel').textContent = event.target.value;
    if (!active) makeChart();
  });
  document.querySelector('#difficulty').addEventListener('change', () => { if (!active) makeChart(); });
  document.querySelector('#soundToggle').addEventListener('click', async event => {
    const button = event.currentTarget;
    if (previewing) {
      song.pause();
      song.currentTime = 0;
      previewing = false;
      button.innerHTML = '♫ <span>SONG PREVIEW</span>';
    } else {
      if (active) return;
      try {
        song.currentTime = 0;
        await song.play();
        previewing = true;
        button.innerHTML = '■ <span>STOP PREVIEW</span>';
        song.onended = () => {
          previewing = false;
          button.innerHTML = '♫ <span>SONG PREVIEW</span>';
        };
      } catch { document.querySelector('#stageMessage b').textContent = '歌曲載入中…'; }
    }
  });

  document.addEventListener('keydown', event => {
    const lane = keys.indexOf(event.key.toLowerCase());
    if (lane >= 0) {
      event.preventDefault();
      if (!event.repeat && !heldLanes.has(lane)) { heldLanes.add(lane); pressLane(lane); }
    }
    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      if (!active) startGame();
      else if (paused) resumeGame();
      else pauseGame();
    }
  });
  document.addEventListener('keyup', event => {
    const lane = keys.indexOf(event.key.toLowerCase());
    if (lane >= 0) {
      heldLanes.delete(lane);
      document.querySelector(`.lane-keys button[data-lane="${lane}"]`)?.classList.remove('active');
    }
  });
  document.querySelectorAll('.lane-keys button').forEach(button => {
    const lane = Number(button.dataset.lane);
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      if (!heldLanes.has(lane)) { heldLanes.add(lane); pressLane(lane); }
    });
    const release = () => {
      heldLanes.delete(lane);
      button.classList.remove('active');
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  });

  song.addEventListener('loadedmetadata', () => {
    document.querySelector('#songTime').textContent = `00:00 / ${formatTime(song.duration)}`;
    makeChart();
  });
  song.addEventListener('error', () => {
    document.querySelector('#stageMessage b').textContent = '找不到歌曲檔';
    document.querySelector('#stageMessage span').textContent = '請確認 assets/yume-no-mukou-e.m4a 已上傳';
  });
  if (song.readyState >= 1) {
    document.querySelector('#songTime').textContent = `00:00 / ${formatTime(song.duration)}`;
    makeChart();
  }
  updateStats();
})();
