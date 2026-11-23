// Πειραματικό · Οδηγός λήψης 0.1.1 · έναρξη με τις πηγές του browser.
import { createBrowserCamera } from './capture.mjs';
import { bindPageLifecycle, createGuide } from './guide-model.mjs';
import { browserClock, mountGuide } from './guide-ui.mjs';
import { mountMeasurement } from './measurement-step.mjs';
import { mountPhotoZoom } from './photo-views.mjs';
import { mountReview } from './review-step.mjs';
import { createBrowserSensors } from './sensors.mjs';

const clock = browserClock(window);
const camera = createBrowserCamera({
  host: window,
  document,
  video: document.getElementById('live-video'),
  fileInput: document.getElementById('capture-file'),
});
const sensors = createBrowserSensors({ host: window, clock });
const guide = createGuide({ camera, sensors, clock });
const zoom = mountPhotoZoom({ document, guide });
const measurement = mountMeasurement({ document, guide, zoom, userAgent: navigator.userAgent });
const review = mountReview({ document, guide, zoom });
mountGuide({ document, guide, clock, onState() { review(); measurement(); } });
bindPageLifecycle(guide, document, window);
