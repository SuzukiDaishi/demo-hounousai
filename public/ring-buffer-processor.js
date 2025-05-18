// public/ring-buffer-processor.js
class LoopProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffersList     = null;
    this.currentBufIdx   = 0;
    this.readIndex       = 0;
    this.switchRequested = false;

    this.port.onmessage = ({ data }) => {
      if (data.channelDataList) {
        this.buffersList = data.channelDataList;
      }
      if (typeof data.mode === 'boolean' && data.mode) {
        this.switchRequested = true;
      }
    };
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!this.buffersList) {
      out.forEach(ch => ch.fill(0));
      return true;
    }
    const bufSet = this.buffersList[this.currentBufIdx];
    const len    = bufSet[0].length;
    const frames = out[0].length;

    for (let i = 0; i < frames; i++) {
      if (this.currentBufIdx === 0 && this.readIndex >= len) this.readIndex = 0;
      if (this.switchRequested && this.readIndex === len - 1) {
        this.currentBufIdx   = 1;
        this.switchRequested = false;
        this.readIndex       = 0;
      }
      for (let ch = 0; ch < out.length; ch++) {
        out[ch][i] = this.buffersList[this.currentBufIdx][ch][this.readIndex];
      }
      this.readIndex++;
      if (this.currentBufIdx === 1 && this.readIndex >= this.buffersList[1][0].length) {
        this.port.postMessage({ ended: true });
        return false;
      }
    }
    return true;
  }
}
registerProcessor('loop-processor', LoopProcessor);