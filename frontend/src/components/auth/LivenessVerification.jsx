import { useCallback, useEffect, useRef, useState } from "react";
const MODEL_URL =
  process.env.REACT_APP_FACEAPI_MODEL_URL ||
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights";

function getFaceApi() {
  return window.faceapi || null;
}

const CHALLENGE_SEC = 10;
const SMILE_MIN = 0.65;
const MOUTH_OPEN_MIN = 0.06;
const EAR_OPEN = 0.24;
const EAR_CLOSED = 0.2;
const REQUIRED_CONSECUTIVE_FRAMES = 4;
const CALIBRATION_FRAMES = 12;
const BLINK_TRANSITION_FRAMES = 2;
const FACE_MATCH_MAX_DISTANCE = Number(process.env.REACT_APP_FACE_MATCH_MAX_DISTANCE || 0.62);

const CHALLENGES = [
  { type: "smile", label: "Please smile" },
  { type: "mouth", label: "Please open your mouth" },
  { type: "blink", label: "Please blink once" },
];

function pickChallenge() {
  return CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
}

function eyeAspectRatio(eye) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return (dist(eye[1], eye[5]) + dist(eye[2], eye[4])) / (2 * dist(eye[0], eye[3]));
}

function mouthOpenRatio(positions) {
  const top = positions[62];
  const bottom = positions[66];
  const jawL = positions[0];
  const jawR = positions[16];
  if (!top || !bottom || !jawL || !jawR) return 0;
  const vertical = Math.hypot(top.x - bottom.x, top.y - bottom.y);
  const width = Math.hypot(jawL.x - jawR.x, jawL.y - jawR.y);
  return width > 1 ? vertical / width : 0;
}

function toImageDataUrl(photo) {
  const raw = String(photo || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("data:image")) return raw;
  const cleaned = raw.replace(/\s+/g, "");
  return `data:image/jpeg;base64,${cleaned}`;
}

function descriptorDistance(descA, descB) {
  if (!descA || !descB || descA.length !== descB.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < descA.length; i += 1) {
    const diff = descA[i] - descB[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function minDescriptorDistance(liveDescriptor, referenceDescriptors = []) {
  if (!liveDescriptor || !Array.isArray(referenceDescriptors) || !referenceDescriptors.length) {
    return Number.POSITIVE_INFINITY;
  }
  let minDistance = Number.POSITIVE_INFINITY;
  for (const ref of referenceDescriptors) {
    const dist = descriptorDistance(liveDescriptor, ref);
    if (Number.isFinite(dist) && dist < minDistance) {
      minDistance = dist;
    }
  }
  return minDistance;
}

async function getMirroredFaceDescriptor(faceapi, image) {
  const width = image.naturalWidth || image.width || 0;
  const height = image.naturalHeight || image.height || 0;
  if (!width || !height) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(image, 0, 0, width, height);

  const mirroredDetection = await faceapi
    .detectSingleFace(
      canvas,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 })
    )
    .withFaceLandmarks()
    .withFaceDescriptor();

  return mirroredDetection?.descriptor || null;
}

/**
 * Active liveness: random expression / landmark challenge via face-api.js
 * (tiny_face_detector, face_landmark_68, face_expression).
 */
export default function LivenessVerification({
  onPassed,
  onCancel,
  challengeSeconds = CHALLENGE_SEC,
  referencePhoto = "",
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const passedRef = useRef(false);
  const blinkPhaseRef = useRef(0);
  const blinkFramesRef = useRef({ open: 0, closed: 0, reopen: 0 });
  const deadlineRef = useRef(0);
  const referenceDescriptorsRef = useRef([]);
  const onPassedRef = useRef(onPassed);
  const baselineRef = useRef({ ear: 0, mouth: 0, samples: 0, calibrated: false });
  const successStreakRef = useRef(0);
  onPassedRef.current = onPassed;

  const [phase, setPhase] = useState("init"); // init | loading | ready | scanning | passed | failed | error
  const [errorMsg, setErrorMsg] = useState("");
  const [challenge] = useState(pickChallenge);
  const [hint, setHint] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(challengeSeconds);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopLoop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPhase("loading");
      setErrorMsg("");
      try {
        const faceapi = getFaceApi();
        if (!faceapi) {
          throw new Error(
            "face-api.js bundle not loaded. Ensure public/vendor/face-api.min.js is present and index.html includes it."
          );
        }
        if (cancelled) return;
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        const referenceImage = toImageDataUrl(referencePhoto);
        if (!referenceImage) {
          throw new Error("Aadhaar photo missing hai. Login dobara karein.");
        }
        const img = await faceapi.fetchImage(referenceImage);
        const refDet = await faceapi
          .detectSingleFace(
            img,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 })
          )
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (!refDet?.descriptor) {
          throw new Error("Aadhaar photo me face detect nahi hua. Clear Aadhaar ZIP use karein.");
        }
        const descriptors = [refDet.descriptor];
        try {
          const mirroredDescriptor = await getMirroredFaceDescriptor(faceapi, img);
          if (mirroredDescriptor) descriptors.push(mirroredDescriptor);
        } catch {
          // Best-effort fallback. Original descriptor is enough for basic matching.
        }
        referenceDescriptorsRef.current = descriptors;
        if (cancelled) return;
        setPhase("ready");
      } catch (e) {
        if (!cancelled) {
          setPhase("error");
          setErrorMsg(
            e?.message || "Could not load face models. Check network or set REACT_APP_FACEAPI_MODEL_URL."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [referencePhoto]);

  useEffect(() => () => {
    stopLoop();
    stopCamera();
  }, [stopLoop, stopCamera]);

  const runScanLoop = useCallback(
    async (faceapi) => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        timerRef.current = setTimeout(() => runScanLoop(faceapi), 100);
        return;
      }

      const now = Date.now();
      if (now >= deadlineRef.current) {
        stopLoop();
        stopCamera();
        setPhase("failed");
        setHint("Time ran out. Try again.");
        return;
      }

      setSecondsLeft(Math.max(0, Math.ceil((deadlineRef.current - now) / 1000)));

      try {
        const det = await faceapi
          .detectSingleFace(
            video,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 })
          )
          .withFaceLandmarks()
          .withFaceExpressions()
          .withFaceDescriptor();

        if (det && !passedRef.current) {
          const referenceDescriptors = referenceDescriptorsRef.current;
          if (!referenceDescriptors?.length) {
            throw new Error("Reference face data missing. Login dobara karein.");
          }
          const liveDistance = minDescriptorDistance(det.descriptor, referenceDescriptors);
          if (!Number.isFinite(liveDistance) || liveDistance > FACE_MATCH_MAX_DISTANCE) {
            successStreakRef.current = 0;
            setHint("Face Aadhaar photo se match nahi hua. Aadhaar holder camera ke saamne aayein.");
            timerRef.current = setTimeout(() => runScanLoop(faceapi), 120);
            return;
          }

          const ex = det.expressions;
          const positions = det.landmarks.positions;
          const leftEAR = eyeAspectRatio(det.landmarks.getLeftEye());
          const rightEAR = eyeAspectRatio(det.landmarks.getRightEye());
          const avgEAR = (leftEAR + rightEAR) / 2;
          const mouthRatio = mouthOpenRatio(positions);

          if (!baselineRef.current.calibrated) {
            baselineRef.current.samples += 1;
            baselineRef.current.ear += avgEAR;
            baselineRef.current.mouth += mouthRatio;
            setHint(`Hold still… calibrating (${baselineRef.current.samples}/${CALIBRATION_FRAMES})`);
            if (baselineRef.current.samples >= CALIBRATION_FRAMES) {
              baselineRef.current.ear /= baselineRef.current.samples;
              baselineRef.current.mouth /= baselineRef.current.samples;
              baselineRef.current.calibrated = true;
              setHint(challenge.label);
            }
          }

          let ok = false;
          if (baselineRef.current.calibrated) {
            const baseEAR = baselineRef.current.ear || EAR_OPEN;
            const baseMouth = baselineRef.current.mouth || MOUTH_OPEN_MIN;
            const adaptiveMouthOpen = Math.max(MOUTH_OPEN_MIN, baseMouth + 0.015);
            const adaptiveEyeOpen = Math.max(EAR_OPEN, baseEAR * 0.9);
            const adaptiveEyeClosed = Math.max(0.16, Math.min(EAR_CLOSED, baseEAR * 0.78));

            if (challenge.type === "smile") {
              ok = (ex.happy || 0) >= SMILE_MIN;
            } else if (challenge.type === "mouth") {
              ok = mouthRatio >= adaptiveMouthOpen;
            } else if (challenge.type === "blink") {
              if (blinkPhaseRef.current === 0) {
                if (avgEAR >= adaptiveEyeOpen) {
                  blinkFramesRef.current.open += 1;
                  if (blinkFramesRef.current.open >= BLINK_TRANSITION_FRAMES) {
                    blinkPhaseRef.current = 1;
                    blinkFramesRef.current.closed = 0;
                    setHint("Blink once (close eyes briefly)");
                  }
                } else {
                  blinkFramesRef.current.open = 0;
                }
              } else if (blinkPhaseRef.current === 1) {
                if (avgEAR <= adaptiveEyeClosed) {
                  blinkFramesRef.current.closed += 1;
                  if (blinkFramesRef.current.closed >= BLINK_TRANSITION_FRAMES) {
                    blinkPhaseRef.current = 2;
                    blinkFramesRef.current.reopen = 0;
                    setHint("Great, now open eyes");
                  }
                } else {
                  blinkFramesRef.current.closed = 0;
                }
              } else if (blinkPhaseRef.current === 2) {
                if (avgEAR >= adaptiveEyeOpen) {
                  blinkFramesRef.current.reopen += 1;
                  if (blinkFramesRef.current.reopen >= BLINK_TRANSITION_FRAMES) {
                    ok = true;
                  }
                } else {
                  blinkFramesRef.current.reopen = 0;
                }
              }
            }
          }

          successStreakRef.current = ok ? successStreakRef.current + 1 : 0;
          if (successStreakRef.current >= REQUIRED_CONSECUTIVE_FRAMES) {
            passedRef.current = true;
            stopLoop();
            stopCamera();
            setPhase("passed");
            setHint("Liveness passed!");
            onPassedRef.current?.();
            return;
          }
        } else {
          successStreakRef.current = 0;
        }
      } catch {
        /* frame skip */
      }

      timerRef.current = setTimeout(() => runScanLoop(faceapi), 120);
    },
    [challenge.type, stopCamera, stopLoop]
  );

  const startScanning = async () => {
    setErrorMsg("");
    passedRef.current = false;
    blinkPhaseRef.current = 0;
    blinkFramesRef.current = { open: 0, closed: 0, reopen: 0 };
    successStreakRef.current = 0;
    baselineRef.current = { ear: 0, mouth: 0, samples: 0, calibrated: false };
    deadlineRef.current = Date.now() + challengeSeconds * 1000;
    setSecondsLeft(challengeSeconds);
    setHint(challenge.label);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setPhase("scanning");
      const faceapi = getFaceApi();
      if (!faceapi) {
        throw new Error(
          "face-api.js bundle not loaded. Ensure public/vendor/face-api.min.js is present and index.html includes it."
        );
      }
      timerRef.current = setTimeout(() => runScanLoop(faceapi), 120);
    } catch (e) {
      setPhase("error");
      setErrorMsg(e?.message || "Camera permission is required for liveness check.");
    }
  };

  const retry = () => {
    passedRef.current = false;
    blinkPhaseRef.current = 0;
    blinkFramesRef.current = { open: 0, closed: 0, reopen: 0 };
    successStreakRef.current = 0;
    baselineRef.current = { ear: 0, mouth: 0, samples: 0, calibrated: false };
    stopLoop();
    stopCamera();
    setPhase("ready");
    setHint("");
    setSecondsLeft(challengeSeconds);
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-white text-xl font-bold">Liveness check</h2>
        <p className="text-slate-400 text-sm mt-1">
          Follow the on-screen prompt so we know you are present ({challengeSeconds}s limit).
        </p>
      </div>

      <div className="relative bg-slate-800 rounded-2xl overflow-hidden aspect-video border border-slate-600">
        {phase === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Loading face models…</p>
          </div>
        )}

        {(phase === "ready" || phase === "failed" || phase === "error") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6">
            <span className="text-4xl">📷</span>
            <p className="text-slate-400 text-sm text-center">
              {phase === "failed"
                ? "Challenge not detected in time."
                : phase === "error"
                  ? errorMsg
                  : "Models ready — start the camera when you are in good light."}
            </p>
          </div>
        )}

        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${
            phase === "scanning" || phase === "passed" ? "" : "hidden"
          }`}
          playsInline
          muted
          style={{ transform: "scaleX(-1)" }}
        />

        {phase === "scanning" && (
          <div className="absolute bottom-0 left-0 right-0 bg-slate-900/80 px-4 py-3 flex justify-between items-center text-sm">
            <span className="text-indigo-300 font-medium">{challenge.label}</span>
            <span className="text-slate-300 font-mono">{secondsLeft}s</span>
          </div>
        )}

        {phase === "passed" && (
          <div className="absolute inset-0 bg-emerald-900/70 flex items-center justify-center">
            <div className="text-center text-emerald-200 font-semibold">✓ Verified</div>
          </div>
        )}
      </div>

      {hint && phase === "scanning" && (
        <p className="text-center text-indigo-300 text-sm font-medium">{hint}</p>
      )}

      {phase === "ready" && (
        <button
          type="button"
          onClick={startScanning}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl"
        >
          Start camera — {challenge.label}
        </button>
      )}

      {phase === "failed" && (
        <button
          type="button"
          onClick={retry}
          className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-3 rounded-xl"
        >
          Try again
        </button>
      )}

      {onCancel && (
        <button
          type="button"
          onClick={() => {
            stopLoop();
            stopCamera();
            onCancel();
          }}
          className="w-full text-slate-400 hover:text-white text-sm py-2"
        >
          ← Back to login
        </button>
      )}

      <p className="text-slate-600 text-xs text-center">
        Video is processed locally in your browser; only a one-time session id is sent to the server
        after you pass.
      </p>
    </div>
  );
}
