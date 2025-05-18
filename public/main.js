// public/main.js

const playBtn   = document.getElementById('play');
const pauseBtn  = document.getElementById('pause');
const toggleChk = document.getElementById('toggle');
const volSlider = document.getElementById('volume');

let audioCtx;
let gainNode;

playBtn.addEventListener('click', async () => {
  // 1. AudioContext と GainNode 準備
  audioCtx = new AudioContext({ sampleRate: 44100 });
  gainNode = audioCtx.createGain();
  // 初期音量をスライダー値に合わせる
  gainNode.gain.value = parseFloat(volSlider.value);

  // 2. Worklet モジュール登録
  await audioCtx.audioWorklet.addModule('ring-buffer-processor.js');

  // 3. 音声読み込み・デコード・トリミング
  const urls = ['/audio/01.mp3', '/audio/02.mp3'];
  const arrayBuffers = await Promise.all(
    urls.map(u => fetch(u).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }))
  );
  const audioBuffers = await Promise.all(
    arrayBuffers.map(ab => audioCtx.decodeAudioData(ab))
  );
  const trimBuffer = buf => {
    const ch0 = buf.getChannelData(0), thr = 1e-4;
    let start = 0, end = ch0.length;
    while (start < ch0.length && Math.abs(ch0[start]) <= thr) start++;
    while (end > 0 && Math.abs(ch0[end - 1]) <= thr) end--;
    return Array.from({ length: buf.numberOfChannels }, (_, ch) =>
      new Float32Array(buf.getChannelData(ch).subarray(start, end))
    );
  };
  const channelDataList = audioBuffers.map(trimBuffer);

  // 4. AudioWorkletNode の生成と接続
  const node = new AudioWorkletNode(audioCtx, 'loop-processor', {
    outputChannelCount: [audioBuffers[0].numberOfChannels]
  });
  node.port.postMessage({ channelDataList, mode: false });
  node.connect(gainNode).connect(audioCtx.destination);

  // 5. チェックボックスで切り替え
  toggleChk.addEventListener('change', e => {
    node.port.postMessage({ mode: e.target.checked });
  });

  // 6. ボリュームスライダー制御
  volSlider.addEventListener('input', e => {
    if (gainNode) {
      gainNode.gain.value = parseFloat(e.target.value);
    }
  });

  // 7. 再生開始 & UI状態更新
  await audioCtx.resume();
  playBtn.disabled  = true;
  pauseBtn.disabled = false;

  // 8. ポーズ／再開ボタン設定
  pauseBtn.addEventListener('click', async () => {
    if (audioCtx.state === 'running') {
      await audioCtx.suspend();
      pauseBtn.textContent = '▶️ 再開';
    } else if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
      pauseBtn.textContent = '⏸️ ポーズ';
    }
  });

  // 9. 再生終了検出
  node.port.onmessage = ({ data }) => {
    if (data.ended) {
      node.disconnect();
      audioCtx.suspend();
      pauseBtn.disabled = true;
    }
  };
});