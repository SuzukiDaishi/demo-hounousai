// public/ring-buffer-processor.js

class LoopProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffersList     = null;   // [[01_ch0,...],[02_ch0,...]]
    this.currentBufIdx   = 0;      // 0 または 1
    this.readIndex       = 0;
    this.switchRequested = false;

    this.port.onmessage = ({ data }) => {
      // 初回バッファ受信
      if (data.channelDataList) {
        this.buffersList = data.channelDataList;
      }
      // モード切り替え（01→02）
      if (typeof data.mode === 'boolean' && data.mode) {
        this.switchRequested = true;
      }
    };
  }

  process(inputs, outputs) {
    const out = outputs[0];

    // A. buffersList 未設定時は無音
    if (!this.buffersList) {
      for (let ch = 0; ch < out.length; ch++) {
        out[ch].fill(0);
      }
      return true;
    }

    const bufSet = this.buffersList[this.currentBufIdx];
    const len    = bufSet[0].length;
    const frames = out[0].length;

    for (let i = 0; i < frames; i++) {
      // B. track0 ループ（01再生時のみ）
      if (this.currentBufIdx === 0 && this.readIndex >= len) {
        this.readIndex = 0;
      }

      // C. 切り替え判定（01末端→02に即時移行）
      if (this.switchRequested && this.readIndex === len - 1) {
        this.currentBufIdx   = 1;
        this.switchRequested = false;
        this.readIndex       = 0;
      }

      // D. 出力サンプル書き込み
      for (let ch = 0; ch < out.length; ch++) {
        const channelBuf = this.buffersList[this.currentBufIdx][ch] || bufSet[0];
        out[ch][i] = channelBuf[this.readIndex];
      }

      this.readIndex++;

      // E. 02終了 → メインへ通知＆停止
      if (this.currentBufIdx === 1 && this.readIndex >= this.buffersList[1][0].length) {
        this.port.postMessage({ ended: true });
        return false;
      }
    }

    return true;
  }
}

registerProcessor('loop-processor', LoopProcessor);
