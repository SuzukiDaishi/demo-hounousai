// public/main.js

document.getElementById('play').addEventListener('click', async () => {
  const audioCtx = new AudioContext({ sampleRate: 44100 });
  console.log('AudioContext.sampleRate =', audioCtx.sampleRate);

  // AudioWorklet モジュール登録
  await audioCtx.audioWorklet.addModule('ring-buffer-processor.js');

  // 並列で 01.mp3 / 02.mp3 を fetch → ArrayBuffer → decodeAudioData
  const urls = ['/audio/01.mp3', '/audio/02.mp3'];
  const arrayBuffers = await Promise.all(
    urls.map(u =>
      fetch(u)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    )
  );
  const audioBuffers = await Promise.all(
    arrayBuffers.map(ab => audioCtx.decodeAudioData(ab))
  );

  // 閾値トリミング（デコーダ遅延と末尾パディング除去）
  const trimBuffer = buf => {
    const ch0 = buf.getChannelData(0), thr = 1e-4;
    let start = 0, end = ch0.length;
    while (start < ch0.length && Math.abs(ch0[start]) <= thr) start++;
    while (end > 0 && Math.abs(ch0[end - 1]) <= thr) end--;
    // 各チャンネルについてサブアレイ取得
    return Array.from({ length: buf.numberOfChannels }, (_, ch) =>
      new Float32Array(buf.getChannelData(ch).subarray(start, end))
    );
  };
  const channelDataList = audioBuffers.map(trimBuffer);

  // AudioWorkletNode生成・接続
  const node = new AudioWorkletNode(audioCtx, 'loop-processor', {
    outputChannelCount: [audioBuffers[0].numberOfChannels]
  });
  // バッファ一覧と初期 mode=false を一度だけ送信
  node.port.postMessage({ channelDataList, mode: false });
  node.connect(audioCtx.destination);

  // 02終了時の後処理
  node.port.onmessage = ({ data }) => {
    if (data.ended) {
      console.log('Playback ended.');
      node.disconnect();
      audioCtx.suspend();
    }
  };

  // チェックボックス切り替えで mode フラグだけ送信
  document.getElementById('toggle').addEventListener('change', e => {
    node.port.postMessage({ mode: e.target.checked });
  });

  // 再生開始
  await audioCtx.resume();
  document.getElementById('play').disabled = true;
  console.log('Playback started at', audioCtx.currentTime, 's');
});
