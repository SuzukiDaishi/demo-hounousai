import './ui.js'; // UI 初期化とスクロール処理

const startButton = document.getElementById('start-button');
const pauseBtn    = document.getElementById('pause');
const volumeSlider= document.getElementById('volume');
let audioCtx, gainNode, workletNode;
const THRESHOLD = 2000, GAP = 100;
let prevZone = 'before';

const windAudio = new Audio('/audio/wind.mp3');
windAudio.loop = false;

startButton.addEventListener('click', async () => {
  // モーダル閉じてスクロール有効化
  document.getElementById('start-modal').style.display = 'none';
  // html と body の両方でスクロールを有効化
  document.documentElement.style.overflowY = 'auto';
  document.body.style.overflowY = 'auto';

  audioCtx = new AudioContext({ sampleRate:44100 });
  gainNode = audioCtx.createGain();
  gainNode.gain.value = parseFloat(volumeSlider.value);
  await audioCtx.audioWorklet.addModule('ring-buffer-processor.js');

  // 音声読み込み
  const urls = ['/audio/01.mp3','/audio/02.mp3'];
  const abufs = await Promise.all(urls.map(u => fetch(u).then(r=>r.arrayBuffer())));
  const audioBuffers = await Promise.all(abufs.map(ab=>audioCtx.decodeAudioData(ab)));

  // 無音トリム
  const trim = buf => {
    const ch0 = buf.getChannelData(0), thr=1e-4; let s=0, e=ch0.length;
    while(s<e && Math.abs(ch0[s])<=thr) s++;
    while(e>0 && Math.abs(ch0[e-1])<=thr) e--;
    return Array.from({length:buf.numberOfChannels},(_,ch)=>buf.getChannelData(ch).subarray(s,e));
  };
  const channelDataList = audioBuffers.map(trim);

  // Worklet ノード
  workletNode = new AudioWorkletNode(audioCtx,'loop-processor',{outputChannelCount:[audioBuffers[0].numberOfChannels]});
  workletNode.port.postMessage({channelDataList,mode:false});
  workletNode.connect(gainNode).connect(audioCtx.destination);

  // スクロール検知→mode切替
  window.addEventListener('scroll',()=>{
    const y=window.scrollY;
    const zone = y<THRESHOLD-GAP?'before':y>THRESHOLD+GAP?'after':'crossing';

    if (zone === 'crossing' && prevZone !== 'crossing') {
      windAudio.currentTime = 0;
      windAudio.play().catch(()=>{});
    }
    // before/after に入ったタイミングで常に mode フラグを同期
    if (zone !== 'crossing' && zone !== prevZone) {
      workletNode.port.postMessage({ mode: (zone === 'after') });
    }
    prevZone=zone;
  },{passive:true});

  // 音量制御
  volumeSlider.addEventListener('input',e=>{gainNode.gain.value=parseFloat(e.target.value);});

  // ポーズ/再開
  pauseBtn.disabled=false;
  pauseBtn.addEventListener('click',async ()=>{
    if(audioCtx.state==='running'){await audioCtx.suspend(); pauseBtn.textContent='▶️ 再開';}
    else {await audioCtx.resume(); pauseBtn.textContent='⏸️ ポーズ';}
  });

  // 終了通知
  workletNode.port.onmessage=({data})=>{
    if(data.ended){workletNode.disconnect(); audioCtx.suspend(); pauseBtn.disabled=true;}
  };

  await audioCtx.resume();
});