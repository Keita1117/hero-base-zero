import { classifyRgbColor, getLocalDateKey } from '../core.js';
import { el, isSafeDataImageUrl } from '../dom.js';

const SCAN_MISSIONS = [
  { id: 'red', title: 'あかい ものを スキャンしよう！', colorKey: 'red', targetJa: 'あか', badge: '🟥' },
  { id: 'blue', title: 'あおい ものを スキャンしよう！', colorKey: 'blue', targetJa: 'あお', badge: '🟦' },
  { id: 'yellow', title: 'きいろい ものを スキャンしよう！', colorKey: 'yellow', targetJa: 'きいろ', badge: '🟨' },
  { id: 'green', title: 'みどりの ものを スキャンしよう！', colorKey: 'green', targetJa: 'みどり', badge: '🟩' },
  { id: 'round', title: 'まるい かたちの ものを みつけよう！', colorKey: null, targetJa: 'まるい もの', badge: '⚪' },
  { id: 'cool', title: 'かっこいい おきにいりを ずかんへ！', colorKey: null, targetJa: 'おきにいり', badge: '⭐' },
];

const COLOR_LABELS = {
  red: 'あか',
  blue: 'あお',
  yellow: 'きいろ',
  green: 'みどり',
  other: 'そのほかの いろ',
};

export function mount(container, ctx) {
  let activeTab = 'scan';
  let missionIdx = 0;
  let stream = null;
  let activeVideoEl = null;
  let cameraState = 'idle'; // 'idle' | 'live' | 'fallback'
  let scansCache = [];
  let lastCapture = null;
  let destroyed = false;

  const root = el('div', { class: 'dock-shell scanner-dock' });
  const tabsBar = el('div', { class: 'sub-tabs', role: 'tablist', 'aria-label': 'たんけん スキャナー' });
  const body = el('div', { class: 'dock-body' });
  root.append(tabsBar, body);
  container.appendChild(root);

  // ずかん拡大ネイティブ <dialog>
  const previewDialog = el('dialog', { class: 'hero-dialog', 'aria-labelledby': 'scan-dialog-title', closedby: 'any' });
  previewDialog.addEventListener('close', () => {
    previewDialog.returnValue = '';
  });
  root.appendChild(previewDialog);

  function stopCamera() {
    if (activeVideoEl) {
      activeVideoEl.srcObject = null;
      activeVideoEl = null;
    }
    if (stream) {
      stream.getTracks().forEach((tr) => tr.stop());
      stream = null;
    }
    if (cameraState === 'live') cameraState = 'idle';
  }

  function renderTabs() {
    const tabs = [
      { id: 'scan', label: '📷 スキャン しゅつどう' },
      { id: 'dex', label: `📘 わたしの ずかん (${scansCache.length})` },
    ];
    tabsBar.replaceChildren(
      ...tabs.map((t) =>
        el('button', {
          type: 'button',
          class: `sub-tab-btn ${activeTab === t.id ? 'is-active' : ''}`,
          role: 'tab',
          'aria-selected': String(activeTab === t.id),
          text: t.label,
          onClick: () => {
            ctx.sound.playTap();
            if (t.id !== 'scan') stopCamera();
            activeTab = t.id;
            renderTabs();
            renderView();
          },
        })
      )
    );
  }

  function analyzeCanvasSource(drawFn) {
    const offscreen = document.createElement('canvas');
    offscreen.width = 480;
    offscreen.height = 360;
    const c2 = offscreen.getContext('2d');
    drawFn(c2, 480, 360);

    // 中央 30% x 30% の平均RGBを測定
    const sx = Math.floor(480 * 0.35);
    const sy = Math.floor(360 * 0.35);
    const sw = Math.floor(480 * 0.30);
    const sh = Math.floor(360 * 0.30);
    const imgData = c2.getImageData(sx, sy, sw, sh).data;

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    const pixelCount = imgData.length / 4;
    for (let i = 0; i < imgData.length; i += 4) {
      rSum += imgData[i];
      gSum += imgData[i + 1];
      bSum += imgData[i + 2];
    }

    const avgR = Math.round(rSum / pixelCount);
    const avgG = Math.round(gSum / pixelCount);
    const avgB = Math.round(bSum / pixelCount);
    const detectedColor = classifyRgbColor(avgR, avgG, avgB);
    const dataUrl = offscreen.toDataURL('image/jpeg', 0.82);

    return { dataUrl, detectedColor, avgR, avgG, avgB };
  }

  async function saveScanEntry(capture, mission) {
    const saved = await ctx.storage.saveMediaItem('scans', {
      title: mission.targetJa,
      missionTitle: mission.title,
      badge: mission.badge,
      detectedColor: COLOR_LABELS[capture.detectedColor] || 'いろいろ',
      dataUrl: capture.dataUrl,
      dateText: getLocalDateKey(),
    });
    scansCache = await ctx.storage.listMediaItems('scans');
    renderTabs();
    return saved;
  }

  async function processCapture(capture) {
    const mission = SCAN_MISSIONS[missionIdx];
    const isColorMission = Boolean(mission.colorKey);
    const matched = !isColorMission || capture.detectedColor === mission.colorKey;

    lastCapture = { ...capture, matched, mission };

    if (matched) {
      ctx.sound.playSuccess();
      await saveScanEntry(capture, mission);
      ctx.voice.speakJa(
        isColorMission
          ? `やったー！ ${mission.targetJa} エネルギー けんしゅつ！ ずかんに とうろくしたよ！`
          : 'すごい！ いいのが とれたね！ ずかんに とうろくしたよ！'
      );
      ctx.awardEnergy(25, { dockId: 'scanner', missionId: 'm_scanner_find' });
    } else {
      ctx.sound.playTryAgain();
      const guessedJa = COLOR_LABELS[capture.detectedColor] || 'べつの いろ';
      ctx.voice.speakJa(`これは ${guessedJa} みたい！ 『${mission.targetJa}』を まんなかの わくに いれてね！`);
    }
    if (!destroyed && activeTab === 'scan') renderScanView();
  }

  function renderScanView() {
    const mission = SCAN_MISSIONS[missionIdx];
    const card = el('div', { class: 'panel-card scanner-card' });

    const missionHeader = el('div', { class: 'scanner-mission-bar' }, [
      el('span', { class: 'scanner-badge', text: mission.badge, 'aria-hidden': 'true' }),
      el('div', { class: 'scanner-mission-text', text: mission.title }),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-gold',
        text: '🔀 おだいを かえる',
        onClick: () => {
          ctx.sound.playTap();
          missionIdx = (missionIdx + 1) % SCAN_MISSIONS.length;
          lastCapture = null;
          ctx.voice.speakJa(SCAN_MISSIONS[missionIdx].title);
          renderScanView();
        },
      }),
    ]);

    const viewfinder = el('div', { class: 'scanner-viewfinder' });
    const videoEl = el('video', {
      class: 'scanner-video',
      autoplay: '',
      playsinline: '',
      muted: '',
    });

    if (cameraState === 'live' && stream) {
      if (activeVideoEl && activeVideoEl !== videoEl) {
        activeVideoEl.srcObject = null;
      }
      activeVideoEl = videoEl;
      videoEl.srcObject = stream;
      viewfinder.appendChild(videoEl);
    } else if (lastCapture && isSafeDataImageUrl(lastCapture.dataUrl)) {
      viewfinder.appendChild(
        el('img', {
          class: 'scanner-preview-img',
          src: lastCapture.dataUrl,
          alt: 'スキャンした しゃしん',
        })
      );
    } else {
      viewfinder.appendChild(
        el('div', { class: 'scanner-placeholder' }, [
          el('div', { class: 'scanner-placeholder-icon', text: '📡', 'aria-hidden': 'true' }),
          el('p', {
            text: cameraState === 'fallback'
              ? 'カメラが おやすみちゅう！ したの「しゃしんから スキャン」か「いろカード」で あそべるよ！'
              : '「カメラを ひらく」か「しゃしんを とる」を おしてね！',
          }),
        ])
      );
    }

    const reticle = el('div', { class: 'scanner-reticle', 'aria-hidden': 'true' });
    viewfinder.appendChild(reticle);

    // File input fallback
    const fileInput = el('input', {
      type: 'file',
      accept: 'image/*',
      capture: 'environment',
      class: 'sr-only-input',
      id: 'scanner-file-input',
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if ((file.type && !file.type.startsWith('image/')) || file.size > 20 * 1024 * 1024) {
        ctx.voice.speakJa('おうちにある しゃしんファイルを えらんでね！');
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => {
        ctx.voice.speakJa('しゃしんを よみこめなかったよ！ もういちど ためしてね！');
      };
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => {
          ctx.voice.speakJa('この しゃしんは ひらけなかったよ！');
        };
        img.onload = () => {
          try {
            const cap = analyzeCanvasSource((c2, w, h) => {
              const scale = Math.max(w / img.width, h / img.height);
              const dw = img.width * scale;
              const dh = img.height * scale;
              c2.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
            });
            processCapture(cap).catch(() => {});
          } catch {
            ctx.voice.speakJa('しゃしんの かいせきに しっぱいしたよ！');
          }
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });

    const controls = el('div', { class: 'btn-row' });

    if (cameraState !== 'live') {
      controls.appendChild(
        el('button', {
          type: 'button',
          class: 'btn-toy btn-cyan',
          text: '🎥 カメラを ひらく',
          onClick: async () => {
            ctx.sound.playTap();
            if (!navigator.mediaDevices?.getUserMedia) {
              cameraState = 'fallback';
              ctx.voice.speakJa('しゃしんボタンから カメラを つかえるよ！');
              renderScanView();
              return;
            }
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false,
              });
              if (destroyed) {
                stopCamera();
                return;
              }
              cameraState = 'live';
              renderScanView();
            } catch {
              cameraState = 'fallback';
              ctx.voice.speakJa('しゃしんボタンか いろカードで スキャンしよう！');
              renderScanView();
            }
          },
        })
      );
    } else {
      controls.appendChild(
        el('button', {
          type: 'button',
          class: 'btn-toy btn-red',
          text: '📸 パシャ！ スキャン！',
          onClick: () => {
            if (!videoEl.videoWidth) {
              ctx.voice.speakJa('カメラを じゅんびちゅう だよ！ もういちど おしてね！');
              return;
            }
            const cap = analyzeCanvasSource((c2, w, h) => {
              const scale = Math.max(w / videoEl.videoWidth, h / videoEl.videoHeight);
              const dw = videoEl.videoWidth * scale;
              const dh = videoEl.videoHeight * scale;
              c2.drawImage(videoEl, (w - dw) / 2, (h - dh) / 2, dw, dh);
            });
            stopCamera();
            processCapture(cap).catch(() => {});
          },
        })
      );
    }

    controls.appendChild(
      el('label', { for: 'scanner-file-input', class: 'btn-toy btn-emerald' }, ['📁 しゃしんを とる／えらぶ'])
    );

    // バーチャル いろテストカード（屋内・非カメラ環境でも色認識テスト＆遊び可能）
    const virtualCardBox = el('div', { class: 'virtual-scan-bar' }, [
      el('span', { class: 'virtual-scan-label', text: '🎨 おうち スキャン カード：' }),
      ...[
        { label: '🟥 あか', rgb: [230, 42, 48] },
        { label: '🟦 あお', rgb: [28, 118, 236] },
        { label: '🟨 きいろ', rgb: [244, 208, 36] },
        { label: '🟩 みどり', rgb: [38, 188, 78] },
      ].map((sample) =>
        el('button', {
          type: 'button',
          class: 'btn-toy btn-slate mini-card-btn',
          text: sample.label,
          onClick: () => {
            ctx.sound.playLaser();
            const cap = analyzeCanvasSource((c2, w, h) => {
              const [r, g, b] = sample.rgb;
              c2.fillStyle = `rgb(${r}, ${g}, ${b})`;
              c2.fillRect(0, 0, w, h);
              c2.fillStyle = 'rgba(255,255,255,0.22)';
              c2.beginPath();
              c2.arc(w / 2, h / 2, 74, 0, Math.PI * 2);
              c2.fill();
            });
            processCapture(cap).catch(() => {});
          },
        })
      ),
    ]);

    const resultBox = el('div', { class: 'scanner-result-box' });
    if (lastCapture) {
      if (lastCapture.matched) {
        resultBox.appendChild(
          el('div', {
            class: 'game-status-banner is-success-banner',
            text: `✨ 「${lastCapture.mission.targetJa}」 けんしゅつ せいこう！ ずかんに いれたよ！ +25⚡`,
          })
        );
      } else {
        const forceSaveBtn = el('button', {
          type: 'button',
          class: 'btn-toy btn-gold',
          text: '📘 そのまま ずかんへ いれる',
          onClick: async () => {
            ctx.sound.playSuccess();
            await saveScanEntry(lastCapture, lastCapture.mission);
            ctx.awardEnergy(10, { dockId: 'scanner', missionId: 'm_scanner_find' });
            lastCapture.matched = true;
            renderScanView();
          },
        });
        resultBox.append(
          el('div', {
            class: 'game-status-banner',
            text: `おしい！ これは「${COLOR_LABELS[lastCapture.detectedColor]}」みたい！`,
          }),
          forceSaveBtn
        );
      }
    }

    card.append(missionHeader, viewfinder, fileInput, controls, virtualCardBox, resultBox);
    body.replaceChildren(card);
  }

  function openScanDialog(item) {
    const safeImgSrc = isSafeDataImageUrl(item.dataUrl) ? item.dataUrl : '';
    previewDialog.replaceChildren(
      el('div', { class: 'hero-dialog-inner' }, [
        el('h2', { id: 'scan-dialog-title', text: `${item.badge || '📷'} ${item.title}` }),
        safeImgSrc ? el('img', { class: 'dialog-scan-img', src: safeImgSrc, alt: item.title }) : null,
        el('p', { class: 'dialog-subtext', text: `いろ：${item.detectedColor} / ひづけ：${item.dateText || ''}` }),
        el('div', { class: 'btn-row' }, [
          el('button', {
            type: 'button',
            class: 'btn-toy btn-red',
            text: '🗑️ けす',
            onClick: async () => {
              ctx.sound.playTap();
              await ctx.storage.deleteMediaItem('scans', item.id);
              scansCache = await ctx.storage.listMediaItems('scans');
              previewDialog.close('deleted');
              renderTabs();
              renderDexView();
            },
          }),
          el('button', {
            type: 'button',
            class: 'btn-toy btn-cyan',
            autofocus: '',
            text: 'とじる',
            onClick: () => previewDialog.close('close'),
          }),
        ]),
      ])
    );
    previewDialog.showModal();
  }

  function renderDexView() {
    const card = el('div', { class: 'panel-card dex-card' });
    if (scansCache.length === 0) {
      card.appendChild(
        el('div', { class: 'empty-state-box' }, [
          el('div', { class: 'empty-emoji', text: '📘', 'aria-hidden': 'true' }),
          el('p', { text: 'まだ ずかんが からっぽだよ！「スキャン しゅつどう」で あつめよう！' }),
        ])
      );
      body.replaceChildren(card);
      return;
    }

    const grid = el('div', { class: 'dex-grid' });
    scansCache.forEach((item) => {
      if (!isSafeDataImageUrl(item.dataUrl)) return;
      grid.appendChild(
        el('button', {
          type: 'button',
          class: 'dex-item-card',
          onClick: () => {
            ctx.sound.playTap();
            openScanDialog(item);
          },
        }, [
          el('img', { src: item.dataUrl, alt: item.title, class: 'dex-thumb' }),
          el('div', { class: 'dex-meta' }, [
            el('span', { text: `${item.badge || '📷'} ${item.title}` }),
            el('small', { text: item.detectedColor || '' }),
          ]),
        ])
      );
    });
    card.appendChild(grid);
    body.replaceChildren(card);
  }

  function renderView() {
    if (activeTab === 'scan') renderScanView();
    else renderDexView();
  }

  ctx.storage.listMediaItems('scans').then((list) => {
    if (destroyed) return;
    scansCache = list;
    renderTabs();
    if (activeTab === 'dex') renderDexView();
  });

  renderTabs();
  renderView();
  ctx.voice.speakJa('リアル たんけん スキャナー！ おへやの いろや ものを みつけよう！');

  return () => {
    destroyed = true;
    stopCamera();
    if (previewDialog.open) previewDialog.close();
  };
}
