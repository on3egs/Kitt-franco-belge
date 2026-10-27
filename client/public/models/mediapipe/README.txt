KITT IMAGE STUDIO — THIRD-PARTY MODEL NOTICE

Model: MediaPipe Selfie Segmenter (general/square model)
Upstream: https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite
Model card: https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter
License: Apache License 2.0
Local file SHA-256: 191AC9529AE506EE0BEEFA6B2C945A172DAB9D07D1E802A290A4E4038226658B

The model separates the prominent person in a photo from its background. It
may miss fine details such as fingers or hair and is not a pixel-perfect mask.
See selfie-segmentation-model-card.pdf for the upstream evaluation and limits.

The MediaPipe Tasks Vision JavaScript/WebAssembly runtime is loaded on demand
from the pinned @mediapipe/tasks-vision 1.1.1 jsDelivr URL. Its package license
and notices are available at /open-source-licenses/mediapipe-APACHE-2.0.txt.
