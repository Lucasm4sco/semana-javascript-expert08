import VideoProcessor from "./videoProcessor.js";
import MP4Demuxer from "./MP4Demuxer.js";
import CanvasRenderer from "./canvasRenderer.js";
import WebMWritable from "../deps/webm-writer2.js";
import Service from "./service.js";

const qvgaConstraints = {
  width: 320,
  height: 240,
};

const vgaConstraints = {
  width: 640,
  height: 480,
};

const hdConstraints = {
  width: 1280,
  height: 720,
};

const encoderConfig = {
  ...qvgaConstraints,
  bitrate: 10e6,
  // WebM
  codec: "vp09.00.10.08",
  pt: 4,
  hardwareAcceleration: "prefer-software",
  // MP4
  // codec: 'avc1.42002A',
  // pt: 1,
  // hardwareAcceleration: 'hardware',
  // avc: {format: 'annexb'}
};

const webmWritableConfig = {
  codec: "VP9",
  width: encoderConfig.width,
  height: encoderConfig.height,
  bitrate: encoderConfig.bitrate,
};

const service = new Service({ url: "http://localhost:3000" });

const mp4Demuxer = new MP4Demuxer();
const videoProcessor = new VideoProcessor({
  mp4Demuxer,
  webMWritable: new WebMWritable(webmWritableConfig),
  service
});

onmessage = async ({ data }) => {
  const renderFrame = CanvasRenderer.getRenderer(data.canvas);

  await videoProcessor.start({
    file: data.file,
    renderFrame,
    encoderConfig,
    sendMessage: (message) => {
      self.postMessage(message);
    },
  });

  // self.postMessage({ status: "done" });
};
