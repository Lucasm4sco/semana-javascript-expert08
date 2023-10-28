export default class VideoProcessor {
  #mp4Demuxer;
  #webMWritable;
  #service;
  // #buffers = [];

  /**
   *
   * @param {object} options
   * @param {import('./MP4Demuxer.js').default} options.mp4Demuxer
   * @param {import('../deps/webm-writer2.js').default} options.webMWritable
   * @param {import('./service.js').default} options.service
   */
  constructor({ mp4Demuxer, webMWritable, service }) {
    this.#mp4Demuxer = mp4Demuxer;
    this.#webMWritable = webMWritable;
    this.#service = service;
  }

  /** @returns {ReadableStream}*/

  mp4Decoder(stream) {
    return new ReadableStream({
      start: async (controller) => {
        const decoder = new VideoDecoder({
          /** @param {VideoFrame} chunk */
          output(frame) {
            controller.enqueue(frame);
          },
          error(e) {
            controller.error(e);
            console.error("error at mp4 decoder:", e);
          },
        });

        return this.#mp4Demuxer.run(stream, {
          onConfig: async (config) => {
            // const { supported } = await VideoDecoder.isConfigSupported(config);

            // if (!supported) {
            //   console.error(
            //     "MP4Demuxer - VideoDecoder config is not supported.",
            //     config
            //   );
            //   return controller.close();
            // }

            decoder.configure(config);
          },
          /** @param {EncodedVideoChunk} chunk */
          onChunk: (chunk) => {
            decoder.decode(chunk);
          },
        });
        // .then(() => {
        //   setTimeout(() => {
        //     controller.close();
        //   }, 8000);
        // });
      },
    });
  }

  encode144p(encoderConfig) {
    let _encoder;

    const readable = new ReadableStream({
      start: async (controller) => {
        const { supported } = await VideoEncoder.isConfigSupported(
          encoderConfig
        );

        if (!supported) {
          const message = "encode144p - VideoEncoder config is not supported.";
          console.error(message, config);
          return controller.error(message);
        }

        _encoder = new VideoEncoder({
          output: (chunk, config) => {
            if (config.decoderConfig) {
              const decoderConfig = {
                type: "config",
                config: config.decoderConfig,
              };
              controller.enqueue(decoderConfig);
            }

            controller.enqueue(chunk);
          },
          error: (error) => {
            console.error("Erro VideoEncoder 144p:", error);
            controller.error(error);
          },
        });

        _encoder.configure(encoderConfig);
      },
    });

    const writable = new WritableStream({
      write: async (frame) => {
        _encoder.encode(frame);
        frame.close();
      },
    });

    return {
      readable,
      writable,
    };
  }

  renderDecodedFramesAndGetEncodedChunks(renderFrame) {
    let _decoder;
    return new TransformStream({
      start: (controller) => {
        _decoder = new VideoDecoder({
          output: (frame) => {
            renderFrame(frame);
          },
          error: (error) => {
            console.error("Erro at render frames", error);
            controller.error(error);
          },
        });
      },
      /**
       *
       * @param {EncodedVideoChunk} encodedChunk
       * @param {TransformStreamDefaultController} controller
       */
      transform: async (encodedChunk, controller) => {
        if (encodedChunk.type === "config") {
          await _decoder.configure(encodedChunk.config);
          return;
        }
        _decoder.decode(encodedChunk);
        controller.enqueue(encodedChunk);

        // need decode to webM
      },
    });
  }

  transformIntoWebM() {
    const writable = new WritableStream({
      write: async (chunk) => {
        this.#webMWritable.addFrame(chunk);
      },
      close: () => {
        // debugger;
      },
    });
    return {
      readable: this.#webMWritable.getStream(),
      writable,
    };
  }

  upload(filename, resolution, type) {
    const chunks = [];
    let byteCount = 0;
    let segmentCount = 1;

    const triggerUpload = async (chunks) => {
      const blob = new Blob(chunks, { type: "video/webm" });

      const finalFilename = `${filename}-${segmentCount}-${resolution}.${type}`;
      this.#service.uploadFile(finalFilename, blob);

      // wtf --> isso remove todos os elementos
      chunks.length = 0;
      byteCount = 0;
      segmentCount++;
    };

    return new WritableStream({
      write: async ({ data }) => {
        chunks.push(data);
        byteCount += data.byteLength;

        if (byteCount <= 10e6) return; // 10mb

        await triggerUpload(chunks);
      },
      close: async () => {
        if (chunks.length) await triggerUpload(chunks);

        segmentCount = 1;
      },
    });
  }

  async start({ file, encoderConfig, renderFrame, sendMessage }) {
    const stream = file.stream();
    const filename = file.name.split("/").pop().replace(".mp4", "");

    await this.mp4Decoder(stream)
      .pipeThrough(this.encode144p(encoderConfig))
      .pipeThrough(this.renderDecodedFramesAndGetEncodedChunks(renderFrame))
      .pipeThrough(this.transformIntoWebM())
      .pipeTo(this.upload(filename, "144p", "webm"));

    sendMessage({ status: "done" });

    // as seguintes linhas podem ser usada como debugg do vídeo localmente
    // .pipeThrough(
    //   new TransformStream({
    //     transform: ({ data, position }, controller) => {
    //       this.#buffers.push(data);
    //       controller.enqueue(data);
    //     },
    //     flush: () => {
    //       // sendMessage({ status: "done", buffers: this.#buffers, filename: filename.concat('-144p.webm') });
    //       sendMessage({ status: "done" });
    //     },
    //   })
    // )
  }
}
