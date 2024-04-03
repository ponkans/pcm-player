class PcmHandler {
  constructor(
    options = { inputCodec: "Int16", channels: 1, sampleRate: 8000 }
  ) {
    this.options = options;
    this.samples = new Float32Array();
  }

  get typedArray() {
    const typedArrays = {
      Int8: Int8Array,
      Int16: Int16Array,
      Int32: Int32Array,
      Float32: Float32Array,
    };
    return typedArrays[this.options.inputCodec];
  }

  get convertValue() {
    const inputCodecs = {
      Int8: 128,
      Int16: 32768,
      Int32: 2147483648,
      Float32: 1,
    };
    return inputCodecs[this.options.inputCodec];
  }

  getFormattedValue(data) {
    if (data.constructor == ArrayBuffer) {
      data = new this.typedArray(data);
    } else {
      data = new this.typedArray(data.buffer);
    }

    let float32 = new Float32Array(data.length);

    for (let i = 0; i < data.length; i++) {
      // buffer 缓冲区的数据，需要 32 位的线性PCM，除以对应的位数范围, 得到-1到+1的数据
      float32[i] = data[i] / this.convertValue;
    }
    return float32;
  }

  handlePcmRawBuffer(buffer) {
    const data = this.getFormattedValue(buffer);
    const tmp = new Float32Array(this.samples.length + data.length);
    tmp.set(this.samples, 0);
    tmp.set(data, this.samples.length);
    this.samples = tmp;
  }
}

class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (event) => this.handleMessage(event);
  }

  handleMessage(event) {
    const { type, options, buffer } = event.data;
    switch (type) {
      case "OPTIONS":
        this.PcmHandlerIns = new PcmHandler(options);
        break;
      case "PCM_RAW_BUFFER":
        this.PcmHandlerIns.handlePcmRawBuffer(buffer);
        break;
      default:
        break;
    }
  }

  /**
   * 将 this.PcmHandlerIns.samples 中的数据, 赋值给 outputs 通道
   *  根据 this.PcmHandlerIns.options.channels 动态处理通道数
   *  this.PcmHandlerIns.samples 数量不足时，跳出循环，保留默认 0 填充
   */
  process(inputs, outputs) {
    const output = outputs[0];
    const channels = this.PcmHandlerIns.options.channels;
    let index = 0;

    if (output.length === channels) {
      for (let i = 0; i < 128; i++) {
        if (index < this.PcmHandlerIns.samples.length / channels) {
          for (let channel = 0; channel < channels; channel++) {
            const outputChannel = output[channel];
            outputChannel[i] =
              this.PcmHandlerIns.samples[index * channels + channel];
          }
          index++;
        } else {
          // 如果samples中没有更多数据，则跳出循环
          break;
        }
      }

      // 将已经处理的样本数据从this.samples中移除
      this.PcmHandlerIns.samples = this.PcmHandlerIns.samples.subarray(
        index * channels
      );
    }

    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
