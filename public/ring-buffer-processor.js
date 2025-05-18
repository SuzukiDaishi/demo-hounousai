// public/ring-buffer-processor.js
// AudioWorkletProcessor を継承し、サンプル単位でのループ & 切り替えを実現
class LoopProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // --- 内部状態 ---
    this.buffersList     = null;   // [ [01_ch0,01_ch1,...], [02_ch0,02_ch1,...] ] の二次元配列
    this.currentBufIdx   = 0;      // 0:01ループ中, 1:02再生中
    this.readIndex       = 0;      // 現在の読み込みサンプル位置
    this.switchRequested = false;  // 切り替えリクエストフラグ

    // メインスレッドからのメッセージ受信設定
    this.port.onmessage = ({ data }) => {
      if (data.channelDataList) {
        // 初回データ受信: buffersList を設定
        this.buffersList = data.channelDataList;
      }
      if (typeof data.mode === 'boolean' && data.mode) {
        // モード切替リクエストをキャッチ
        this.switchRequested = true;
      }
    };
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!this.buffersList) {
      // データ未受信時は全チャンネル無音
      out.forEach(ch => ch.fill(0));
      return true;
    }
    const bufSet = this.buffersList[this.currentBufIdx];
    const len    = bufSet[0].length;
    const frames = out[0].length;

    for (let i = 0; i < frames; i++) {
      // 01ループ: 末尾到達で先頭へ
      if (this.currentBufIdx === 0 && this.readIndex >= len) {
        this.readIndex = 0;
      }
      // 切り替え判定: リクエストあり && 01の最後の1サンプル目出力後
      if (this.switchRequested && this.readIndex === len - 1) {
        this.currentBufIdx   = 1;
        this.switchRequested = false;
        this.readIndex       = 0;
      }
      // 各チャンネルごとにサンプル出力
      for (let ch = 0; ch < out.length; ch++) {
        out[ch][i] = this.buffersList[this.currentBufIdx][ch][this.readIndex];
      }
      this.readIndex++;
      // 02終了時: メインへ通知して process を終了
      if (this.currentBufIdx === 1 && this.readIndex >= this.buffersList[1][0].length) {
        this.port.postMessage({ ended: true });
        return false; // ノード破棄指示
      }
    }
    return true; // 継続処理
  }
}

// Worklet として登録
registerProcessor('loop-processor', LoopProcessor);