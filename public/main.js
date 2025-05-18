// public/main.js

// DOM 要素の取得
const playBtn   = document.getElementById('play');     // 再生開始ボタン
const pauseBtn  = document.getElementById('pause');    // ポーズ／再開ボタン
const toggleChk = document.getElementById('toggle');   // ループ切り替えチェックボックス
const volSlider = document.getElementById('volume');   // ボリュームスライダー

// AudioContext と GainNode を格納する変数
let audioCtx;
let gainNode;

// 再生開始ボタンがクリックされた時の処理
playBtn.addEventListener('click', async () => {
  // 1. AudioContext の生成 (サンプルレート指定あり)
  audioCtx = new AudioContext({ sampleRate: 44100 });

  // 2. GainNode を作成し初期音量をスライダー値に設定
  gainNode = audioCtx.createGain();
  gainNode.gain.value = parseFloat(volSlider.value);

  // 3. Worklet モジュールの登録
  //   ring-buffer-processor.js に定義した AudioWorkletProcessor を追加
  await audioCtx.audioWorklet.addModule('ring-buffer-processor.js');

  // 4. 音声ファイルのフェッチ、デコード、無音トリミング
  const urls = ['/audio/01.mp3', '/audio/02.mp3'];
  // 並列で fetch -> ArrayBuffer
  const arrayBuffers = await Promise.all(
    urls.map(u =>
      fetch(u)
        .then(res => { if (!res.ok) throw new Error(res.status); return res.arrayBuffer(); })
    )
  );
  // ArrayBuffer -> AudioBuffer にデコード
  const audioBuffers = await Promise.all(
    arrayBuffers.map(ab => audioCtx.decodeAudioData(ab))
  );
  // 閾値 (thr = 1e-4) 未満の先頭・末尾の無音部分を削除
  const trimBuffer = buf => {
    const ch0 = buf.getChannelData(0);
    const thr = 1e-4;
    let start = 0, end = ch0.length;
    // 先頭無音をスキップ
    while (start < ch0.length && Math.abs(ch0[start]) <= thr) start++;
    // 末尾無音をスキップ
    while (end > 0 && Math.abs(ch0[end - 1]) <= thr) end--;
    // 各チャンネルごとにサブアレイを抽出
    return Array.from({ length: buf.numberOfChannels }, (_, ch) =>
      new Float32Array(buf.getChannelData(ch).subarray(start, end))
    );
  };
  const channelDataList = audioBuffers.map(trimBuffer);

  // 5. AudioWorkletNode の生成と接続設定
  const node = new AudioWorkletNode(audioCtx, 'loop-processor', {
    outputChannelCount: [audioBuffers[0].numberOfChannels]
  });
  // Worklet 側にチャンネルデータと初期モード (mode=false: 01ループ) を送信
  node.port.postMessage({ channelDataList, mode: false });
  // ノード接続: Processor -> GainNode -> 出力
  node.connect(gainNode).connect(audioCtx.destination);

  // 6. チェックボックス変更時にモード切り替えメッセージを送信
  toggleChk.addEventListener('change', e => {
    node.port.postMessage({ mode: e.target.checked });
  });

  // 7. ボリュームスライダー操作時の処理
  //   再生中・再生前いずれも GainNode のゲインをリアルタイム更新
  volSlider.addEventListener('input', e => {
    if (gainNode) {
      gainNode.gain.value = parseFloat(e.target.value);
    }
  });

  // 8. 再生開始: AudioContext を動作状態に
  await audioCtx.resume();
  // UI 更新: 再生ボタン無効化、ポーズボタン有効化
  playBtn.disabled  = true;
  pauseBtn.disabled = false;

  // 9. ポーズ／再開ボタンの動作切り替え
  pauseBtn.addEventListener('click', async () => {
    if (audioCtx.state === 'running') {
      // 再生中 → 一時停止
      await audioCtx.suspend();
      pauseBtn.textContent = '▶️ 再開';
    } else if (audioCtx.state === 'suspended') {
      // 停止中 → 再開
      await audioCtx.resume();
      pauseBtn.textContent = '⏸️ ポーズ';
    }
  });

  // 10. Worklet から再生終了通知を受信したら停止処理
  node.port.onmessage = ({ data }) => {
    if (data.ended) {
      node.disconnect();        // Processor ノード切断
      audioCtx.suspend();       // AudioContext を停止
      pauseBtn.disabled = true; // ポーズボタンを無効化
    }
  };
});