/* =====================================================
   STRIDE — Run Tracker (Advanced Edition)
   Vanilla JS. No frameworks, no build step.
   Persistence: localStorage.
   ===================================================== */

(() => {
  'use strict';

  /* ═══════════════════ STORAGE LAYER ═══════════════════ */
  const STORAGE_KEY = 'stride_runs_v2';

  const Storage = {
    getRuns(){
      try{
        // migrate v1 data
        const v1 = localStorage.getItem('stride_runs_v1');
        const v2 = localStorage.getItem(STORAGE_KEY);
        if(!v2 && v1){
          localStorage.setItem(STORAGE_KEY, v1);
          return JSON.parse(v1);
        }
        return v2 ? JSON.parse(v2) : [];
      } catch(e){ return []; }
    },
    saveRuns(runs){
      try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(runs)); }
      catch(e){ console.error('Could not save runs', e); }
    },
    addRun(run){
      const runs = Storage.getRuns();
      runs.push(run);
      Storage.saveRuns(runs);
      return runs;
    },
    deleteRun(id){
      const runs = Storage.getRuns().filter(r => r.id !== id);
      Storage.saveRuns(runs);
      return runs;
    }
  };

  /* ═══════════════════ GEO UTILITIES ═══════════════════ */
  function haversineKm(a, b){
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const c = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
  }
  function toRad(deg){ return deg * Math.PI / 180; }

  function formatTime(totalSeconds){
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    if(h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function formatPace(secondsPerKm){
    if(!isFinite(secondsPerKm) || secondsPerKm <= 0) return '0:00';
    const m = Math.floor(secondsPerKm / 60);
    const s = Math.round(secondsPerKm % 60);
    return `${m}:${String(s).padStart(2,'0')}`;
  }
  function estimateCalories(km, weightKg = 70){
    return Math.round(km * weightKg * 1.036);
  }
  function dateKey(d){
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  /** Map pace (sec/km) to a gradient color: green (fast) → yellow → red (slow) */
  function paceToColor(secPerKm){
    const min = secPerKm / 60;
    const clamped = Math.max(3, Math.min(9, min));
    const hue = 120 - ((clamped - 3) / 6) * 120;
    return `hsl(${hue}, 90%, 50%)`;
  }

  function escapeHtml(str){
    if(!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ═══════════════════ AUDIO CUES ═══════════════════ */
  const AudioCue = {
    ctx: null,

    init(){
      try{ this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(e){ /* no audio */ }
    },

    play(){
      if(!this.ctx) return;
      try{
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, this.ctx.currentTime);
        osc.frequency.setValueAtTime(1100, this.ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
        osc.start(this.ctx.currentTime);
        osc.stop(this.ctx.currentTime + 0.3);
      } catch(e){ /* silent fail */ }

      // Vibration feedback
      if(navigator.vibrate) navigator.vibrate([100, 50, 100]);
    }
  };

  /* ═══════════════════ CONFETTI ═══════════════════ */
  const Confetti = {
    launch(canvas){
      const ctx = canvas.getContext('2d');
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      const colors = ['#FF4D00','#C8F052','#FFD600','#FF6D00','#FFFFFF','#00E676'];
      const particles = [];

      for(let i = 0; i < 70; i++){
        particles.push({
          x: canvas.width / 2 + (Math.random() - 0.5) * 120,
          y: canvas.height * 0.25,
          vx: (Math.random() - 0.5) * 10,
          vy: Math.random() * -12 - 2,
          size: Math.random() * 6 + 2,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.3,
          shape: Math.random() > 0.5 ? 'rect' : 'circle'
        });
      }

      function animate(){
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;

        particles.forEach(p => {
          p.x += p.vx;
          p.vy += 0.35;
          p.y += p.vy;
          p.vx *= 0.99;
          p.alpha -= 0.01;
          p.rotation += p.rotSpeed;

          if(p.alpha > 0 && p.y < canvas.height + 20){
            alive = true;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.fillStyle = p.color;
            if(p.shape === 'rect'){
              ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            } else {
              ctx.beginPath();
              ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
        });

        if(alive) requestAnimationFrame(animate);
      }
      animate();
    }
  };

  /* ═══════════════════ MAP MANAGER ═══════════════════ */
  const DEFAULT_CENTER = [19.0760, 72.8777];

  const MAP_LAYERS = {
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attr: '&copy; OpenStreetMap &copy; CARTO',
      label: 'Dark'
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attr: '&copy; Esri',
      label: 'Satellite'
    },
    terrain: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attr: '&copy; OpenStreetMap &copy; OpenTopoMap',
      label: 'Terrain'
    }
  };

  const MapManager = {
    map: null,
    currentLayerKey: 'dark',
    tileLayer: null,
    paceLayerGroup: null,
    markerGroup: null,
    startMarker: null,
    liveMarker: null,
    kmMarkers: [],
    lastKnownPos: null,

    init(){
      this.map = L.map('map', {
        zoomControl: false,
        attributionControl: true
      }).setView(DEFAULT_CENTER, 15);

      const layerDef = MAP_LAYERS[this.currentLayerKey];
      this.tileLayer = L.tileLayer(layerDef.url, {
        attribution: layerDef.attr,
        maxZoom: 19
      }).addTo(this.map);

      this.paceLayerGroup = L.layerGroup().addTo(this.map);
      this.markerGroup = L.layerGroup().addTo(this.map);

      // Hide shimmer once tiles load
      this.map.once('load', () => {
        document.getElementById('mapShimmer').classList.add('loaded');
      });
      this.tileLayer.once('load', () => {
        document.getElementById('mapShimmer').classList.add('loaded');
      });
      // Fallback timeout for shimmer
      setTimeout(() => {
        document.getElementById('mapShimmer').classList.add('loaded');
      }, 3000);
    },

    switchLayer(key){
      if(!MAP_LAYERS[key]) return;
      this.currentLayerKey = key;
      const layerDef = MAP_LAYERS[key];
      this.map.removeLayer(this.tileLayer);
      this.tileLayer = L.tileLayer(layerDef.url, {
        attribution: layerDef.attr,
        maxZoom: 19
      }).addTo(this.map);

      // Show layer label briefly
      const label = document.getElementById('layerLabel');
      label.textContent = layerDef.label;
      label.classList.remove('hidden');
      // Force re-trigger animation
      label.style.animation = 'none';
      label.offsetHeight; // reflow
      label.style.animation = '';
    },

    cycleLayer(){
      const keys = Object.keys(MAP_LAYERS);
      const idx = keys.indexOf(this.currentLayerKey);
      const next = keys[(idx + 1) % keys.length];
      this.switchLayer(next);
    },

    clearRoute(){
      this.paceLayerGroup.clearLayers();
      this.markerGroup.clearLayers();
      this.startMarker = null;
      this.liveMarker = null;
      this.kmMarkers = [];
    },

    setStartMarker(lat, lng){
      if(this.startMarker) this.markerGroup.removeLayer(this.startMarker);
      const icon = L.divIcon({
        className: 'start-marker-wrap',
        html: '<div class="start-dot"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      this.startMarker = L.marker([lat, lng], { icon, interactive: false }).addTo(this.markerGroup);
    },

    setLiveMarker(lat, lng){
      if(this.liveMarker){
        this.liveMarker.setLatLng([lat, lng]);
      } else {
        const icon = L.divIcon({
          className: 'runner-marker',
          html: '<div class="runner-dot"><div class="runner-ring"></div></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });
        this.liveMarker = L.marker([lat, lng], { icon, interactive: false, zIndexOffset: 1000 }).addTo(this.markerGroup);
      }
      this.lastKnownPos = [lat, lng];
    },

    addPaceSegment(points, paceSecPerKm){
      if(points.length < 2) return;
      const color = paceToColor(paceSecPerKm);
      const latlngs = points.map(p => [p.lat, p.lng]);
      // Main colored line
      const line = L.polyline(latlngs, {
        color: color,
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      });
      // Glow line underneath
      const glow = L.polyline(latlngs, {
        color: color,
        weight: 12,
        opacity: 0.15,
        lineCap: 'round',
        lineJoin: 'round'
      });
      this.paceLayerGroup.addLayer(glow);
      this.paceLayerGroup.addLayer(line);
    },

    addKmMarker(km, latlng){
      const icon = L.divIcon({
        className: 'km-marker-wrap',
        html: `<div class="km-marker">${km}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      const marker = L.marker(latlng, { icon, interactive: false }).addTo(this.markerGroup);
      this.kmMarkers.push(marker);
    },

    recenter(){
      if(this.lastKnownPos){
        this.map.setView(this.lastKnownPos, 17, { animate: true });
      }
    },

    /** Render pace-colored route on a given map (for detail view) */
    renderPaceRoute(mapInstance, points){
      if(!points || points.length < 2) return;

      const SEGMENT_SIZE = 4;
      for(let i = 0; i < points.length - 1; i += SEGMENT_SIZE){
        const end = Math.min(i + SEGMENT_SIZE + 1, points.length);
        const seg = points.slice(i, end);
        if(seg.length < 2) continue;

        let pace = 360; // default ~6min/km
        // If timestamps available (3rd element), compute real pace
        if(seg[0].length >= 3 && seg[seg.length - 1].length >= 3){
          const dist = haversineKm(
            { lat: seg[0][0], lng: seg[0][1] },
            { lat: seg[seg.length - 1][0], lng: seg[seg.length - 1][1] }
          );
          const time = (seg[seg.length - 1][2] - seg[0][2]) / 1000;
          if(dist > 0.001 && time > 0) pace = time / dist;
        }

        const color = paceToColor(pace);
        const latlngs = seg.map(p => [p[0], p[1]]);

        L.polyline(latlngs, {
          color: color,
          weight: 5,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(mapInstance);

        L.polyline(latlngs, {
          color: color,
          weight: 12,
          opacity: 0.12,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(mapInstance);
      }

      // Start marker
      const startIcon = L.divIcon({
        className: 'start-marker-wrap',
        html: '<div class="start-dot"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      L.marker([points[0][0], points[0][1]], { icon: startIcon, interactive: false }).addTo(mapInstance);

      // End marker
      const last = points[points.length - 1];
      const endIcon = L.divIcon({
        className: 'end-marker-wrap',
        html: '<div class="end-dot"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      L.marker([last[0], last[1]], { icon: endIcon, interactive: false }).addTo(mapInstance);

      // Km markers along route
      let cumDist = 0;
      let nextKm = 1;
      for(let i = 1; i < points.length; i++){
        cumDist += haversineKm(
          { lat: points[i-1][0], lng: points[i-1][1] },
          { lat: points[i][0], lng: points[i][1] }
        );
        if(cumDist >= nextKm){
          const kmIcon = L.divIcon({
            className: 'km-marker-wrap',
            html: `<div class="km-marker">${nextKm}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
          });
          L.marker([points[i][0], points[i][1]], { icon: kmIcon, interactive: false }).addTo(mapInstance);
          nextKm++;
        }
      }
    }
  };

  /* ═══════════════════ TRACKER ENGINE ═══════════════════ */
  const LANE_CIRCUMFERENCE = 2 * Math.PI * 98;
  const RING_KM_PER_LOOP = 1;
  const SEGMENT_POINT_COUNT = 5; // points per pace segment

  const Tracker = {
    watchId: null,
    points: [],
    laps: [],
    splits: [],
    distanceKm: 0,
    startTime: null,
    elapsedBeforePause: 0,
    pauseStarted: null,
    isRecording: false,
    isPaused: false,
    timerInterval: null,
    lastSplitKm: 0,
    lastSplitTime: 0,
    currentSegPoints: [],
    segStartTime: 0,
    lastSpeed: 0,

    start(){
      if(!navigator.geolocation){
        setGpsStatus('GPS not supported', false);
        alert('Your browser does not support geolocation.');
        return;
      }

      // Initialize audio on user gesture
      AudioCue.init();

      this.points = [];
      this.laps = [];
      this.splits = [];
      this.distanceKm = 0;
      this.startTime = Date.now();
      this.elapsedBeforePause = 0;
      this.isRecording = true;
      this.isPaused = false;
      this.lastSplitKm = 0;
      this.lastSplitTime = 0;
      this.currentSegPoints = [];
      this.segStartTime = Date.now();
      this.lastSpeed = 0;

      MapManager.clearRoute();

      setGpsStatus('Acquiring signal…', false);
      document.getElementById('speedPill').classList.remove('hidden');

      this.watchId = navigator.geolocation.watchPosition(
        pos => this.onPosition(pos),
        err => this.onError(err),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
      );

      this.timerInterval = setInterval(() => UI.updateLiveTimer(), 1000);
      UI.enterRecordingMode();
    },

    onPosition(pos){
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      const point = { lat, lng, t: Date.now() };

      setGpsStatus(`GPS locked · ±${Math.round(accuracy)}m`, true);

      if(this.points.length === 0){
        MapManager.map.setView([lat, lng], 17);
        MapManager.setStartMarker(lat, lng);
      }

      if(!this.isPaused){
        if(this.points.length > 0){
          const prev = this.points[this.points.length - 1];
          const segment = haversineKm(prev, point);
          if(segment > 0.001){
            this.distanceKm += segment;
          }
        }
        this.points.push(point);

        // Build pace-colored segments
        this.currentSegPoints.push(point);
        if(this.currentSegPoints.length >= SEGMENT_POINT_COUNT){
          const segDist = haversineKm(this.currentSegPoints[0], this.currentSegPoints[this.currentSegPoints.length - 1]);
          const segTime = (this.currentSegPoints[this.currentSegPoints.length - 1].t - this.currentSegPoints[0].t) / 1000;
          const segPace = (segDist > 0.001 && segTime > 0) ? segTime / segDist : 360;
          MapManager.addPaceSegment(this.currentSegPoints, segPace);
          // Keep last point for continuity
          this.currentSegPoints = [this.currentSegPoints[this.currentSegPoints.length - 1]];
          this.segStartTime = Date.now();
        }

        // Live runner marker
        MapManager.setLiveMarker(lat, lng);
        MapManager.map.panTo([lat, lng], { animate: true });

        // Speed calculation (last 3 points)
        this.updateSpeed();

        // Check km splits
        const currentKm = Math.floor(this.distanceKm);
        if(currentKm > this.lastSplitKm && currentKm > 0){
          const elapsed = this.getElapsedSeconds();
          const splitTime = elapsed - this.lastSplitTime;
          this.splits.push({
            km: currentKm,
            splitSeconds: splitTime,
            totalSeconds: elapsed,
            paceSecPerKm: splitTime
          });
          this.lastSplitKm = currentKm;
          this.lastSplitTime = elapsed;

          // Audio cue + km marker
          AudioCue.play();
          MapManager.addKmMarker(currentKm, [lat, lng]);
        }

        UI.updateLiveStats();
      }
    },

    updateSpeed(){
      const pts = this.points;
      if(pts.length < 2){ this.lastSpeed = 0; return; }
      const n = Math.min(4, pts.length);
      const recent = pts.slice(-n);
      const dist = haversineKm(recent[0], recent[recent.length - 1]);
      const time = (recent[recent.length - 1].t - recent[0].t) / 1000;
      this.lastSpeed = (time > 0) ? (dist / time) * 3600 : 0; // km/h
    },

    onError(err){
      const messages = {
        1: 'Location permission denied',
        2: 'Location unavailable',
        3: 'Location timed out'
      };
      setGpsStatus(messages[err.code] || 'GPS error', false);
    },

    pause(){
      this.isPaused = true;
      this.pauseStarted = Date.now();
      UI.setPauseUI(true);
    },

    resume(){
      this.isPaused = false;
      this.elapsedBeforePause += Date.now() - this.pauseStarted;
      this.pauseStarted = null;
      UI.setPauseUI(false);
    },

    lap(){
      const elapsed = this.getElapsedSeconds();
      this.laps.push({ km: this.distanceKm, seconds: elapsed });
    },

    getElapsedSeconds(){
      if(!this.startTime) return 0;
      const pauseOffset = this.isPaused ? (Date.now() - this.pauseStarted) : 0;
      return (Date.now() - this.startTime - this.elapsedBeforePause - pauseOffset) / 1000;
    },

    stop(){
      if(this.watchId !== null){
        navigator.geolocation.clearWatch(this.watchId);
        this.watchId = null;
      }
      clearInterval(this.timerInterval);
      this.isRecording = false;

      // Flush remaining segment
      if(this.currentSegPoints.length >= 2){
        const segDist = haversineKm(this.currentSegPoints[0], this.currentSegPoints[this.currentSegPoints.length - 1]);
        const segTime = (this.currentSegPoints[this.currentSegPoints.length - 1].t - this.currentSegPoints[0].t) / 1000;
        const segPace = (segDist > 0.001 && segTime > 0) ? segTime / segDist : 360;
        MapManager.addPaceSegment(this.currentSegPoints, segPace);
      }
    },

    buildRunRecord(note){
      const elapsed = this.getElapsedSeconds();
      const paceSecPerKm = this.distanceKm > 0.02 ? elapsed / this.distanceKm : 0;
      return {
        id: 'run_' + Date.now(),
        date: new Date().toISOString(),
        distanceKm: Number(this.distanceKm.toFixed(3)),
        durationSec: Math.round(elapsed),
        paceSecPerKm: Math.round(paceSecPerKm),
        calories: estimateCalories(this.distanceKm),
        points: this.points.map(p => [p.lat, p.lng, p.t]),
        laps: this.laps,
        splits: this.splits,
        note: note || ''
      };
    }
  };

  /* ═══════════════════ GPS STATUS ═══════════════════ */
  function setGpsStatus(text, live){
    document.getElementById('gpsText').textContent = text;
    document.getElementById('gpsPill').querySelector('.gps-dot').classList.toggle('live', !!live);
  }

  /* ═══════════════════ UI CONTROLLER ═══════════════════ */
  const UI = {
    els: {},

    cacheEls(){
      [
        'liveTime','liveDistance','livePace','liveCal',
        'btnRecord','btnRecordLabel','btnPause','btnLap','btnFinish',
        'laneProgress','laneGlow','streakNum',
        'saveModal','modalDistance','modalSummary','runNote','modalPR','prDetail',
        'historyList','emptyHistory','totalKm','totalRuns','bestStreak','heatmapGrid',
        'speedPill','speedValue','confettiCanvas',
        'weeklyChart','prList','monthlySummary','paceChart'
      ].forEach(id => this.els[id] = document.getElementById(id));
    },

    enterRecordingMode(){
      this.els.btnRecord.classList.add('is-recording');
      this.els.btnRecordLabel.textContent = 'Recording…';
      this.els.btnRecord.disabled = true;
      this.els.btnPause.disabled = false;
      this.els.btnLap.disabled = false;
      this.els.btnFinish.classList.remove('hidden');
      this.updateLiveStats();
      this.updateLiveTimer();
    },

    exitRecordingMode(){
      this.els.btnRecord.classList.remove('is-recording');
      this.els.btnRecordLabel.textContent = 'Start Run';
      this.els.btnRecord.disabled = false;
      this.els.btnPause.disabled = true;
      this.els.btnPause.textContent = 'Pause';
      this.els.btnLap.disabled = true;
      this.els.btnFinish.classList.add('hidden');
      this.els.laneProgress.style.strokeDashoffset = LANE_CIRCUMFERENCE;
      this.els.laneGlow.style.strokeDashoffset = LANE_CIRCUMFERENCE;
      this.els.liveTime.textContent = '00:00';
      this.els.liveDistance.textContent = '0.00';
      this.els.livePace.textContent = '0:00';
      this.els.liveCal.textContent = '0';
      this.els.speedPill.classList.add('hidden');
      this.els.speedValue.textContent = '0.0';
    },

    setPauseUI(paused){
      this.els.btnPause.textContent = paused ? 'Resume' : 'Pause';
    },

    updateLiveTimer(){
      const seconds = Tracker.getElapsedSeconds();
      this.els.liveTime.textContent = formatTime(seconds);
    },

    updateLiveStats(){
      const km = Tracker.distanceKm;
      const elapsed = Tracker.getElapsedSeconds();
      const pace = km > 0.02 ? elapsed / km : 0;

      this.els.liveDistance.textContent = km.toFixed(2);
      this.els.livePace.textContent = formatPace(pace);
      this.els.liveCal.textContent = estimateCalories(km);

      // Speed display
      this.els.speedValue.textContent = Tracker.lastSpeed.toFixed(1);

      // Progress ring
      const progress = (km % RING_KM_PER_LOOP) / RING_KM_PER_LOOP;
      const offset = LANE_CIRCUMFERENCE * (1 - progress);
      this.els.laneProgress.style.strokeDashoffset = offset;
      this.els.laneGlow.style.strokeDashoffset = offset;
    },

    openSaveModal(){
      const km = Tracker.distanceKm;
      const elapsed = Tracker.getElapsedSeconds();
      const pace = km > 0.02 ? elapsed / km : 0;
      this.els.modalDistance.textContent = `${km.toFixed(2)} km`;
      this.els.modalSummary.textContent = `${formatTime(elapsed)} · ${formatPace(pace)} /km`;
      this.els.runNote.value = '';

      // Check for PRs
      const runs = Storage.getRuns();
      const prs = this.checkPRs(runs, km, elapsed, pace);
      if(prs.length > 0){
        this.els.modalPR.classList.remove('hidden');
        this.els.prDetail.textContent = prs.join(' · ');
      } else {
        this.els.modalPR.classList.add('hidden');
      }

      this.els.saveModal.classList.remove('hidden');

      // Launch confetti
      setTimeout(() => Confetti.launch(this.els.confettiCanvas), 100);
    },

    checkPRs(existingRuns, newKm, newDuration, newPace){
      if(existingRuns.length === 0) return newKm > 0.1 ? ['First run!'] : [];
      const prs = [];
      const validRuns = existingRuns.filter(r => r.distanceKm > 0.1);

      if(newKm > 0.1){
        const maxDist = Math.max(...validRuns.map(r => r.distanceKm), 0);
        if(newKm > maxDist) prs.push('Longest run');

        if(newPace > 0 && newKm > 0.5){
          const paces = validRuns.filter(r => r.paceSecPerKm > 0 && r.distanceKm > 0.5).map(r => r.paceSecPerKm);
          const bestPace = paces.length > 0 ? Math.min(...paces) : Infinity;
          if(newPace < bestPace) prs.push('Fastest pace');
        }

        const maxDur = Math.max(...validRuns.map(r => r.durationSec), 0);
        if(newDuration > maxDur) prs.push('Longest duration');
      }
      return prs;
    },

    closeSaveModal(){
      this.els.saveModal.classList.add('hidden');
    },

    renderStreak(){
      const runs = Storage.getRuns();
      const { current } = computeStreaks(runs);
      this.els.streakNum.textContent = current;
    },

    renderHistory(){
      const runs = Storage.getRuns().slice().sort((a, b) => new Date(b.date) - new Date(a.date));
      const list = this.els.historyList;
      list.innerHTML = '';

      if(runs.length === 0){
        this.els.emptyHistory.classList.remove('hidden');
      } else {
        this.els.emptyHistory.classList.add('hidden');
        runs.forEach(run => list.appendChild(this.buildRunCard(run)));
      }

      const totalKm = runs.reduce((sum, r) => sum + r.distanceKm, 0);
      this.els.totalKm.textContent = totalKm.toFixed(1);
      this.els.totalRuns.textContent = runs.length;
      const { best } = computeStreaks(runs);
      this.els.bestStreak.textContent = best;

      this.renderHeatmap(runs);
    },

    buildRunCard(run){
      const d = new Date(run.date);
      const card = document.createElement('button');
      card.className = 'run-card';
      card.innerHTML = `
        <div class="run-card-date">
          <span class="run-card-day">${d.getDate()}</span>
          <span class="run-card-month">${d.toLocaleString('default',{month:'short'})}</span>
        </div>
        <div class="run-card-divider"></div>
        <div class="run-card-info">
          <div class="run-card-title">${escapeHtml(run.note) || 'Run'}</div>
          <div class="run-card-meta">${formatTime(run.durationSec)} · ${formatPace(run.paceSecPerKm)}/km</div>
        </div>
        <div class="run-card-dist">
          <span class="run-card-dist-val">${run.distanceKm.toFixed(2)}</span>
          <span class="run-card-dist-unit">km</span>
        </div>
      `;
      card.addEventListener('click', () => Router.showDetail(run.id));
      return card;
    },

    renderHeatmap(runs){
      const grid = this.els.heatmapGrid;
      grid.innerHTML = '';
      const days = 84;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const kmByDay = {};
      runs.forEach(r => {
        const k = dateKey(new Date(r.date));
        kmByDay[k] = (kmByDay[k] || 0) + r.distanceKm;
      });

      for(let i = days - 1; i >= 0; i--){
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const km = kmByDay[dateKey(d)] || 0;
        const cell = document.createElement('div');
        let level = 0;
        if(km > 0) level = 1;
        if(km >= 3) level = 2;
        if(km >= 7) level = 3;
        cell.className = `hm-cell hm-${level}`;
        cell.title = `${dateKey(d)}: ${km.toFixed(1)} km`;
        grid.appendChild(cell);
      }
    }
  };

  /* ═══════════════════ STATS VIEW ═══════════════════ */
  const StatsView = {
    render(){
      const runs = Storage.getRuns();
      this.renderWeeklyChart(runs);
      this.renderPRs(runs);
      this.renderMonthly(runs);
      this.renderPaceDistribution(runs);
    },

    renderWeeklyChart(runs){
      const chart = document.getElementById('weeklyChart');
      chart.innerHTML = '';

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dayOfWeek = today.getDay();

      // Compute km per week for last 8 weeks
      const weeks = [];
      for(let w = 7; w >= 0; w--){
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() - dayOfWeek - (w * 7) + 6);
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6);

        let km = 0;
        runs.forEach(r => {
          const rd = new Date(r.date);
          rd.setHours(0, 0, 0, 0);
          if(rd >= weekStart && rd <= weekEnd) km += r.distanceKm;
        });

        weeks.push({
          km,
          label: `${weekStart.toLocaleDateString('default', { month: 'short', day: 'numeric' })}`
        });
      }

      const maxKm = Math.max(...weeks.map(w => w.km), 1);

      weeks.forEach(w => {
        const pct = (w.km / maxKm) * 100;
        const col = document.createElement('div');
        col.className = 'week-col';
        col.innerHTML = `
          <div class="week-bar" style="height:${Math.max(pct, 2)}%">
            <span class="week-bar-val">${w.km.toFixed(1)}</span>
          </div>
          <span class="week-label">${w.label}</span>
        `;
        chart.appendChild(col);
      });
    },

    renderPRs(runs){
      const container = document.getElementById('prList');
      container.innerHTML = '';

      const valid = runs.filter(r => r.distanceKm > 0.1);
      if(valid.length === 0){
        container.innerHTML = '<p class="pr-empty">Complete your first run to see records.</p>';
        return;
      }

      // Fastest pace (only runs > 0.5 km)
      const paceRuns = valid.filter(r => r.paceSecPerKm > 0 && r.distanceKm > 0.5);
      let fastestPace = null;
      if(paceRuns.length > 0){
        fastestPace = paceRuns.reduce((best, r) => r.paceSecPerKm < best.paceSecPerKm ? r : best);
      }

      // Longest distance
      const longestDist = valid.reduce((best, r) => r.distanceKm > best.distanceKm ? r : best);

      // Longest duration
      const longestTime = valid.reduce((best, r) => r.durationSec > best.durationSec ? r : best);

      // Best weekly distance
      const today = new Date();
      const weekKms = {};
      valid.forEach(r => {
        const d = new Date(r.date);
        const weekNum = getWeekNumber(d);
        weekKms[weekNum] = (weekKms[weekNum] || 0) + r.distanceKm;
      });
      const bestWeekKm = Math.max(...Object.values(weekKms), 0);

      const records = [];

      if(fastestPace){
        records.push({
          icon: '⚡', iconClass: 'pr-icon--pace',
          name: 'Fastest Pace',
          value: `${formatPace(fastestPace.paceSecPerKm)} /km`,
          date: new Date(fastestPace.date).toLocaleDateString('default', { month: 'short', day: 'numeric' })
        });
      }

      records.push({
        icon: '📏', iconClass: 'pr-icon--dist',
        name: 'Longest Run',
        value: `${longestDist.distanceKm.toFixed(2)} km`,
        date: new Date(longestDist.date).toLocaleDateString('default', { month: 'short', day: 'numeric' })
      });

      records.push({
        icon: '⏱', iconClass: 'pr-icon--time',
        name: 'Longest Duration',
        value: formatTime(longestTime.durationSec),
        date: new Date(longestTime.date).toLocaleDateString('default', { month: 'short', day: 'numeric' })
      });

      records.push({
        icon: '📊', iconClass: 'pr-icon--week',
        name: 'Best Week',
        value: `${bestWeekKm.toFixed(1)} km`,
        date: ''
      });

      records.forEach(pr => {
        const el = document.createElement('div');
        el.className = 'pr-item';
        el.innerHTML = `
          <div class="pr-icon ${pr.iconClass}">${pr.icon}</div>
          <div class="pr-info">
            <div class="pr-name">${pr.name}</div>
            <div class="pr-val">${pr.value}</div>
          </div>
          ${pr.date ? `<span class="pr-date">${pr.date}</span>` : ''}
        `;
        container.appendChild(el);
      });
    },

    renderMonthly(runs){
      const container = document.getElementById('monthlySummary');
      container.innerHTML = '';

      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
      const lastYear = thisMonth === 0 ? thisYear - 1 : thisYear;

      const thisMonthRuns = runs.filter(r => {
        const d = new Date(r.date);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      });
      const lastMonthRuns = runs.filter(r => {
        const d = new Date(r.date);
        return d.getMonth() === lastMonth && d.getFullYear() === lastYear;
      });

      const thisKm = thisMonthRuns.reduce((s, r) => s + r.distanceKm, 0);
      const lastKm = lastMonthRuns.reduce((s, r) => s + r.distanceKm, 0);
      const thisCount = thisMonthRuns.length;
      const lastCount = lastMonthRuns.length;
      const thisAvgPace = thisMonthRuns.length > 0
        ? thisMonthRuns.reduce((s, r) => s + r.paceSecPerKm, 0) / thisMonthRuns.length : 0;
      const lastAvgPace = lastMonthRuns.length > 0
        ? lastMonthRuns.reduce((s, r) => s + r.paceSecPerKm, 0) / lastMonthRuns.length : 0;

      const stats = [
        {
          label: 'Distance', value: `${thisKm.toFixed(1)} km`,
          trend: lastKm > 0 ? ((thisKm - lastKm) / lastKm * 100) : (thisKm > 0 ? 100 : 0)
        },
        {
          label: 'Runs', value: thisCount,
          trend: lastCount > 0 ? ((thisCount - lastCount) / lastCount * 100) : (thisCount > 0 ? 100 : 0)
        },
        {
          label: 'Avg Pace', value: thisAvgPace > 0 ? `${formatPace(thisAvgPace)}` : '—',
          trend: (lastAvgPace > 0 && thisAvgPace > 0) ? ((lastAvgPace - thisAvgPace) / lastAvgPace * 100) : 0,
          inverted: true // lower pace is better
        },
        {
          label: 'Calories', value: thisMonthRuns.reduce((s, r) => s + (r.calories || 0), 0),
          trend: 0
        }
      ];

      stats.forEach(s => {
        const trendClass = s.trend > 2 ? 'up' : (s.trend < -2 ? 'down' : 'flat');
        const trendText = Math.abs(s.trend) > 2
          ? `${s.trend > 0 ? '↑' : '↓'} ${Math.abs(s.trend).toFixed(0)}%`
          : '—';
        const el = document.createElement('div');
        el.className = 'month-stat';
        el.innerHTML = `
          <span class="month-stat-label">${s.label}</span>
          <span class="month-stat-val">${s.value}</span>
          <span class="month-trend ${trendClass}">${trendText}</span>
        `;
        container.appendChild(el);
      });
    },

    renderPaceDistribution(runs){
      const container = document.getElementById('paceChart');
      container.innerHTML = '';

      const valid = runs.filter(r => r.paceSecPerKm > 0 && r.distanceKm > 0.2);
      if(valid.length === 0){
        container.innerHTML = '<p class="pace-empty">Complete runs to see pace distribution.</p>';
        return;
      }

      const buckets = [
        { label: '< 4:00', min: 0, max: 240, color: 'hsl(120,90%,50%)' },
        { label: '4 – 5', min: 240, max: 300, color: 'hsl(90,90%,50%)' },
        { label: '5 – 6', min: 300, max: 360, color: 'hsl(60,90%,50%)' },
        { label: '6 – 7', min: 360, max: 420, color: 'hsl(30,90%,50%)' },
        { label: '7 – 8', min: 420, max: 480, color: 'hsl(15,90%,50%)' },
        { label: '8+', min: 480, max: Infinity, color: 'hsl(0,90%,50%)' }
      ];

      buckets.forEach(b => {
        b.count = valid.filter(r => r.paceSecPerKm >= b.min && r.paceSecPerKm < b.max).length;
      });

      const maxCount = Math.max(...buckets.map(b => b.count), 1);

      buckets.forEach(b => {
        const pct = (b.count / maxCount) * 100;
        const row = document.createElement('div');
        row.className = 'pace-row';
        row.innerHTML = `
          <span class="pace-bucket">${b.label}</span>
          <div class="pace-bar-track">
            <div class="pace-bar-fill" style="width:${pct}%;background:${b.color}"></div>
          </div>
          <span class="pace-count">${b.count}</span>
        `;
        container.appendChild(row);
      });
    }
  };

  function getWeekNumber(d){
    const oneJan = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
  }

  /* ═══════════════════ STREAK LOGIC ═══════════════════ */
  function computeStreaks(runs){
    if(runs.length === 0) return { current: 0, best: 0 };

    const uniqueDays = [...new Set(runs.map(r => dateKey(new Date(r.date))))]
      .sort((a, b) => new Date(a) - new Date(b));

    let best = 1, run = 1;
    for(let i = 1; i < uniqueDays.length; i++){
      const prev = new Date(uniqueDays[i - 1]);
      const curr = new Date(uniqueDays[i]);
      const diffDays = Math.round((curr - prev) / 86400000);
      if(diffDays === 1){ run++; } else { run = 1; }
      if(run > best) best = run;
    }

    const todayKey = dateKey(new Date());
    const yestKey = dateKey(new Date(Date.now() - 86400000));
    let current = 0;
    const daySet = new Set(uniqueDays);
    let cursor = daySet.has(todayKey) ? new Date() : (daySet.has(yestKey) ? new Date(Date.now() - 86400000) : null);

    if(cursor){
      while(daySet.has(dateKey(cursor))){
        current++;
        cursor = new Date(cursor.getTime() - 86400000);
      }
    }

    return { current, best };
  }

  /* ═══════════════════ ROUTER ═══════════════════ */
  const Router = {
    showView(name){
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(`view-${name}`).classList.add('active');
      document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
      if(name === 'history') UI.renderHistory();
      if(name === 'stats') StatsView.render();
      if(name === 'track' && MapManager.map) setTimeout(() => MapManager.map.invalidateSize(), 50);
    },

    showDetail(runId){
      const run = Storage.getRuns().find(r => r.id === runId);
      if(!run) return;

      const content = document.getElementById('detailContent');
      const d = new Date(run.date);

      // Build comparison data
      const allRuns = Storage.getRuns().filter(r => r.distanceKm > 0.1 && r.id !== run.id);
      let comparisonHTML = '';
      if(allRuns.length > 0){
        const avgPace = allRuns.reduce((s, r) => s + r.paceSecPerKm, 0) / allRuns.length;
        const avgDist = allRuns.reduce((s, r) => s + r.distanceKm, 0) / allRuns.length;

        const paceDiff = run.paceSecPerKm - avgPace;
        const distDiff = run.distanceKm - avgDist;

        const paceClass = paceDiff < -5 ? 'positive' : (paceDiff > 5 ? 'negative' : 'neutral');
        const distClass = distDiff > 0.1 ? 'positive' : (distDiff < -0.1 ? 'negative' : 'neutral');

        const paceText = Math.abs(paceDiff) > 5
          ? `${formatPace(Math.abs(paceDiff))} ${paceDiff < 0 ? 'faster' : 'slower'}`
          : 'On par';
        const distText = Math.abs(distDiff) > 0.1
          ? `${Math.abs(distDiff).toFixed(1)} km ${distDiff > 0 ? 'longer' : 'shorter'}`
          : 'On par';

        comparisonHTML = `
          <div class="comparison-card">
            <div class="compare-item">
              <span class="compare-label">vs Avg Pace</span>
              <span class="compare-value ${paceClass}">${paceText}</span>
            </div>
            <div class="compare-item">
              <span class="compare-label">vs Avg Distance</span>
              <span class="compare-value ${distClass}">${distText}</span>
            </div>
          </div>
        `;
      }

      // Build splits table
      let splitsHTML = '';
      const splits = run.splits || [];
      if(splits.length > 0){
        const maxSplitPace = Math.max(...splits.map(s => s.paceSecPerKm));
        const splitRows = splits.map(s => {
          const barPct = maxSplitPace > 0 ? (s.paceSecPerKm / maxSplitPace) * 100 : 0;
          const barColor = paceToColor(s.paceSecPerKm);
          return `
            <div class="split-row">
              <span class="split-km">${s.km}</span>
              <span class="split-time mono">${formatTime(s.splitSeconds)}</span>
              <span class="split-pace mono">${formatPace(s.paceSecPerKm)}</span>
              <div class="split-bar"><div class="split-bar-fill" style="width:${barPct}%;background:${barColor}"></div></div>
            </div>
          `;
        }).join('');

        splitsHTML = `
          <div class="splits-card">
            <div class="splits-head">Km Splits</div>
            <div class="splits-table">
              <div class="split-row split-header">
                <span>KM</span><span>Split</span><span>Pace</span><span></span>
              </div>
              ${splitRows}
            </div>
          </div>
        `;
      }

      content.innerHTML = `
        <div class="detail-map" id="detailMap"></div>
        <h2 class="detail-title">${escapeHtml(run.note) || 'Run'}</h2>
        <p class="detail-date">${d.toLocaleDateString('default',{weekday:'long', month:'long', day:'numeric', year:'numeric'})}</p>
        <div class="detail-stats">
          <div class="detail-stat">
            <span class="detail-stat-val mono">${run.distanceKm.toFixed(2)}</span>
            <span class="detail-stat-label">Distance (km)</span>
          </div>
          <div class="detail-stat">
            <span class="detail-stat-val mono">${formatTime(run.durationSec)}</span>
            <span class="detail-stat-label">Duration</span>
          </div>
          <div class="detail-stat">
            <span class="detail-stat-val mono">${formatPace(run.paceSecPerKm)}</span>
            <span class="detail-stat-label">Pace (/km)</span>
          </div>
          <div class="detail-stat">
            <span class="detail-stat-val mono">${run.calories || estimateCalories(run.distanceKm)}</span>
            <span class="detail-stat-label">Calories</span>
          </div>
        </div>
        ${comparisonHTML}
        ${splitsHTML}
        <button class="detail-delete" id="btnDeleteRun">Delete this run</button>
      `;

      Router.showView('detail');

      // Render detail map with pace-colored route
      setTimeout(() => {
        const dMap = L.map('detailMap', {
          zoomControl: false,
          attributionControl: false,
          dragging: true,
          scrollWheelZoom: false
        });

        const layerDef = MAP_LAYERS[MapManager.currentLayerKey];
        L.tileLayer(layerDef.url, { maxZoom: 19 }).addTo(dMap);

        if(run.points && run.points.length > 0){
          MapManager.renderPaceRoute(dMap, run.points);
          const latlngs = run.points.map(p => [p[0], p[1]]);
          const bounds = L.latLngBounds(latlngs);
          dMap.fitBounds(bounds, { padding: [28, 28] });
        } else {
          dMap.setView(DEFAULT_CENTER, 13);
        }
      }, 80);

      document.getElementById('btnDeleteRun').addEventListener('click', () => {
        if(confirm('Delete this run? This cannot be undone.')){
          Storage.deleteRun(run.id);
          UI.renderStreak();
          Router.showView('history');
        }
      });
    }
  };

  /* ═══════════════════ EVENT WIRING ═══════════════════ */
  function wireEvents(){
    // Navigation
    document.querySelectorAll('.navbtn').forEach(btn => {
      btn.addEventListener('click', () => Router.showView(btn.dataset.view));
    });

    // Record button
    document.getElementById('btnRecord').addEventListener('click', () => Tracker.start());

    // Pause/Resume
    document.getElementById('btnPause').addEventListener('click', () => {
      if(Tracker.isPaused) Tracker.resume(); else Tracker.pause();
    });

    // Lap
    document.getElementById('btnLap').addEventListener('click', () => Tracker.lap());

    // Finish
    document.getElementById('btnFinish').addEventListener('click', () => {
      if(Tracker.distanceKm < 0.01){
        if(!confirm('This run is very short. Save it anyway?')) return;
      }
      Tracker.stop();
      UI.openSaveModal();
    });

    // Save run
    document.getElementById('btnSaveRun').addEventListener('click', () => {
      const note = document.getElementById('runNote').value.trim();
      const record = Tracker.buildRunRecord(note);
      Storage.addRun(record);
      UI.closeSaveModal();
      UI.exitRecordingMode();
      UI.renderStreak();
      Router.showView('history');
    });

    // Discard
    document.getElementById('btnDiscard').addEventListener('click', () => {
      if(confirm('Discard this run? It will not be saved.')){
        UI.closeSaveModal();
        UI.exitRecordingMode();
      }
    });

    // Back from detail
    document.getElementById('btnBackFromDetail').addEventListener('click', () => Router.showView('history'));

    // Map controls
    document.getElementById('btnMapLayer').addEventListener('click', () => MapManager.cycleLayer());
    document.getElementById('btnRecenter').addEventListener('click', () => MapManager.recenter());
    document.getElementById('btnZoomIn').addEventListener('click', () => MapManager.map.zoomIn());
    document.getElementById('btnZoomOut').addEventListener('click', () => MapManager.map.zoomOut());

    // Prevent accidental close during recording
    window.addEventListener('beforeunload', (e) => {
      if(Tracker.isRecording){
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /* ═══════════════════ INIT ═══════════════════ */
  function init(){
    UI.cacheEls();
    MapManager.init();
    wireEvents();
    UI.renderStreak();
    UI.renderHistory();

    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(
        pos => {
          MapManager.map.setView([pos.coords.latitude, pos.coords.longitude], 15);
          MapManager.lastKnownPos = [pos.coords.latitude, pos.coords.longitude];
        },
        () => setGpsStatus('Enable location to track runs', false),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setGpsStatus('GPS not supported', false);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();