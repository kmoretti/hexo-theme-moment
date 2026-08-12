(() => {
  const settings = window.paperMomentsConfig || {};
  const musicConfig = settings.music || {};
  const rootEl = document.querySelector('[data-music-player]');
  if (!rootEl) return;
  const audio = rootEl.querySelector('[data-music-audio]');
  if (!audio) return;
  const playlist = Array.isArray(musicConfig.playlist)
    ? musicConfig.playlist.filter(track => track && track.url)
    : [];
  if (!playlist.length) return;

  const labels = {
    play: musicConfig.play_label || '播放',
    pause: musicConfig.pause_label || '暂停',
    empty: musicConfig.empty_label || '暂无歌曲',
    noLyrics: musicConfig.no_lyrics_label || '暂无歌词',
  };

  const orb = rootEl.querySelector('[data-music-orb]');
  const orbCover = rootEl.querySelector('[data-music-orb-cover]');
  const bar = rootEl.querySelector('[data-music-bar]');
  const coverEl = rootEl.querySelector('[data-music-cover]');
  const titleEl = rootEl.querySelector('[data-music-title]');
  const artistEl = rootEl.querySelector('[data-music-artist]');
  const timeEl = rootEl.querySelector('[data-music-time]');
  const rangeEl = rootEl.querySelector('[data-music-range]');
  const toggleBtn = rootEl.querySelector('[data-music-toggle]');
  const prevBtn = rootEl.querySelector('[data-music-prev]');
  const nextBtn = rootEl.querySelector('[data-music-next]');
  const volumeBtn = rootEl.querySelector('[data-music-volume]');
  const lyricsBtn = rootEl.querySelector('[data-music-lyrics]');
  const closeBtn = rootEl.querySelector('[data-music-close]');
  const lyricsPanel = rootEl.querySelector('[data-music-lyrics-panel]');
  const lyricsTitle = rootEl.querySelector('[data-music-lyrics-title]');
  const lyricsScroll = rootEl.querySelector('[data-music-lyrics-scroll]');
  const lyricsCloseBtn = rootEl.querySelector('[data-music-lyrics-close]');
  const icons = window.paperMomentsIcons;

  let currentIndex = 0;
  let isPlaying = false;
  let currentLrc = [];
  let lastVolume = 0.9;

  const pad = n => String(n).padStart(2, '0');
  const formatTime = sec => {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    return `${Math.floor(sec / 60)}:${pad(Math.floor(sec % 60))}`;
  };

  const setToggleIcon = () => {
    if (!toggleBtn || !icons) return;
    const name = isPlaying ? 'pause' : 'play';
    toggleBtn.innerHTML = '';
    toggleBtn.appendChild(icons.create(name));
    toggleBtn.setAttribute('aria-label', isPlaying ? labels.pause : labels.play);
    toggleBtn.setAttribute('title', isPlaying ? labels.pause : labels.play);
  };

  const setVolumeIcon = () => {
    if (!volumeBtn || !icons) return;
    volumeBtn.innerHTML = '';
    volumeBtn.appendChild(icons.create(audio.muted ? 'volume-x' : 'volume'));
    volumeBtn.setAttribute('aria-label', musicConfig.volume_label || '音量');
    volumeBtn.setAttribute('title', musicConfig.volume_label || '音量');
  };

  const renderCover = cover => {
    coverEl.innerHTML = '';
    orbCover.hidden = true;
    orbCover.innerHTML = '';
    if (!cover) return;
    const coverImg = new Image();
    coverImg.src = cover;
    coverImg.alt = '';
    coverImg.className = 'music-player__bar-cover-img';
    coverEl.appendChild(coverImg);
    const orbImg = new Image();
    orbImg.src = cover;
    orbImg.alt = '';
    orbImg.className = 'music-player__orb-cover-img';
    orbCover.hidden = false;
    orbCover.appendChild(orbImg);
  };

  const renderLyrics = () => {
    lyricsScroll.innerHTML = '';
    if (!currentLrc.length) {
      const empty = document.createElement('p');
      empty.className = 'music-player__lyrics-empty';
      empty.textContent = labels.noLyrics;
      lyricsScroll.appendChild(empty);
      return;
    }
    currentLrc.forEach(line => {
      const row = document.createElement('p');
      row.className = 'music-player__lyrics-line';
      row.textContent = line.text;
      lyricsScroll.appendChild(row);
    });
  };

  const parseLrc = text => {
    const prefixRe = /^(?:\[\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?\])+/;
    const timeRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    const lines = [];
    String(text).split(/\r?\n/).forEach(row => {
      const prefix = prefixRe.exec(row);
      if (!prefix) return;
      const content = row.slice(prefix[0].length).replace(timeRe, '').trim();
      if (!content) return;
      timeRe.lastIndex = 0;
      let match;
      while ((match = timeRe.exec(prefix[0])) !== null) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const frac = match[3] ? parseFloat(`0.${match[3]}`) : 0;
        lines.push({ time: min * 60 + sec + frac, text: content });
      }
    });
    lines.sort((a, b) => a.time - b.time);
    return lines;
  };

  const syncLyrics = () => {
    if (!currentLrc.length || !lyricsScroll || lyricsPanel.hidden) return;
    const t = audio.currentTime;
    let idx = -1;
    for (let i = 0; i < currentLrc.length; i += 1) {
      if (t >= currentLrc[i].time) idx = i;
      else break;
    }
    const lines = lyricsScroll.querySelectorAll('.music-player__lyrics-line');
    lines.forEach((el, i) => el.classList.toggle('is-current', i === idx));
    if (idx < 0) return;
    const current = lines[idx];
    if (!current) return;
    const target = current.offsetTop - lyricsScroll.clientHeight / 2 + current.clientHeight / 2;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    lyricsScroll.scrollTo({ top: Math.max(0, target), behavior: reduce ? 'auto' : 'smooth' });
  };

  const updateProgress = () => {
    const dur = audio.duration || 0;
    const cur = audio.currentTime || 0;
    timeEl.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    if (dur) rangeEl.value = String(Math.round((cur / dur) * 1000));
  };

  const play = () => {
    audio.play()
      .then(() => {
        isPlaying = true;
        rootEl.classList.add('is-playing');
        setToggleIcon();
      })
      .catch(() => {
        isPlaying = false;
        setToggleIcon();
      });
  };

  const pause = () => {
    audio.pause();
    isPlaying = false;
    rootEl.classList.remove('is-playing');
    setToggleIcon();
  };

  const toggle = () => (isPlaying ? pause() : play());

  const next = () => {
    pause();
    loadTrack((currentIndex + 1) % playlist.length);
    play();
  };

  const prev = () => {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    pause();
    loadTrack((currentIndex - 1 + playlist.length) % playlist.length);
    play();
  };

  const loadTrack = index => {
    const track = playlist[index];
    if (!track) return;
    currentIndex = index;
    titleEl.textContent = track.title || labels.empty;
    artistEl.textContent = track.artist || '';
    lyricsTitle.textContent = track.title || '';
    rangeEl.value = 0;
    timeEl.textContent = '0:00 / 0:00';
    audio.src = track.url;
    renderCover(track.cover);
    currentLrc = [];
    renderLyrics();
    if (!track.lrc) return;
    fetch(track.lrc)
      .then(res => (res.ok ? res.text() : Promise.reject(new Error('lrc fetch failed'))))
      .then(text => {
        currentLrc = parseLrc(text);
        renderLyrics();
      })
      .catch(() => {
        currentLrc = [];
        renderLyrics();
      });
  };

  const openBar = () => {
    bar.hidden = false;
    orb.setAttribute('aria-expanded', 'true');
  };

  const closeBar = () => {
    bar.hidden = true;
    orb.setAttribute('aria-expanded', 'false');
  };

  const toggleBar = () => (bar.hidden ? openBar() : closeBar());

  const toggleLyrics = () => {
    const hidden = lyricsPanel.hidden;
    lyricsPanel.hidden = !hidden;
    lyricsBtn.setAttribute('aria-expanded', String(!hidden));
    if (!hidden) syncLyrics();
  };

  const closeLyrics = () => {
    lyricsPanel.hidden = true;
    lyricsBtn.setAttribute('aria-expanded', 'false');
  };

  orb.addEventListener('click', toggleBar);
  closeBtn.addEventListener('click', closeBar);
  toggleBtn.addEventListener('click', toggle);
  nextBtn.addEventListener('click', next);
  prevBtn.addEventListener('click', prev);
  volumeBtn.addEventListener('click', () => {
    if (audio.muted) {
      audio.muted = false;
      if (audio.volume === 0) audio.volume = lastVolume || 0.9;
    } else {
      if (audio.volume > 0) lastVolume = audio.volume;
      audio.muted = true;
    }
    setVolumeIcon();
  });
  lyricsBtn.addEventListener('click', toggleLyrics);
  lyricsCloseBtn.addEventListener('click', closeLyrics);

  audio.addEventListener('play', () => {
    isPlaying = true;
    rootEl.classList.add('is-playing');
    setToggleIcon();
  });
  audio.addEventListener('pause', () => {
    isPlaying = false;
    rootEl.classList.remove('is-playing');
    setToggleIcon();
  });
  audio.addEventListener('timeupdate', () => {
    updateProgress();
    syncLyrics();
  });
  audio.addEventListener('durationchange', updateProgress);
  audio.addEventListener('ended', next);
  rangeEl.addEventListener('input', () => {
    const dur = audio.duration || 0;
    if (dur) audio.currentTime = (parseInt(rangeEl.value, 10) / 1000) * dur;
  });

  document.addEventListener('pjax:complete', () => {
    setToggleIcon();
    setVolumeIcon();
  });

  loadTrack(0);
  setToggleIcon();
  setVolumeIcon();

  window.paperMomentsMusicPlayer = { toggle, play, pause, next, prev, loadTrack, openBar, closeBar, toggleLyrics };
})();
