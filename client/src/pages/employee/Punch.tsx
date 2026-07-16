import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, MapPin, ScanFace, CheckCircle2, RefreshCw } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Card, Skeleton } from '../../components/ui';
import { useToast } from '../../components/Toast';
import type { AttendanceRecord } from '../../types';

/*
 * Punch flow with basic anti-spoofing:
 *  1. Camera only — there is deliberately no file/gallery input on this page.
 *  2. Liveness — while the preview runs we sample frames and require natural
 *     motion (blink / small head movement) by measuring pixel change between
 *     frames on a downsampled grayscale grid. A printed photo or a static
 *     screen held to the camera produces near-zero variation and fails.
 *  3. Geolocation + timestamp are captured at the moment of the punch.
 */

type Step = 'idle' | 'camera' | 'captured' | 'submitting' | 'done';

const LIVENESS_EVENTS_NEEDED = 3;
const MOTION_MIN = 2.2; // below = static image
const MOTION_MAX = 60;  // above = camera being waved around

function frameSignature(video: HTMLVideoElement, canvas: HTMLCanvasElement): number[] | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || video.videoWidth === 0) return null;
  canvas.width = 32; canvas.height = 32;
  ctx.drawImage(video, 0, 0, 32, 32);
  const { data } = ctx.getImageData(0, 0, 32, 32);
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return gray;
}

function diffScore(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length; // mean absolute pixel change (0–255)
}

/** Map getUserMedia failures to actionable messages instead of one generic toast. */
function cameraErrorMessage(err: unknown): string {
  const name = (err as DOMException | undefined)?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera permission was denied. Click the camera icon in the address bar, allow access, then try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found on this device.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is in use by another app. Close it (Zoom, Teams, etc.) and try again.';
    case 'OverconstrainedError':
      return 'The camera does not support the requested resolution. Try a different device.';
    default:
      return 'Could not start the camera. Check browser permissions and try again.';
  }
}

export default function Punch() {
  const toast = useToast();
  const navigate = useNavigate();
  const [today, setToday] = useState<AttendanceRecord | null | undefined>(undefined);
  const [step, setStep] = useState<Step>('idle');
  const [photo, setPhoto] = useState<string | null>(null);
  const [livenessOk, setLivenessOk] = useState(false);
  // State (not a ref) so the progress bar actually re-renders as events accrue.
  const [motionEvents, setMotionEvents] = useState(0);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null | 'denied'>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const probeRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastSigRef = useRef<number[] | null>(null);

  const mode: 'in' | 'out' = today && !today.punch_out_at ? 'out' : 'in';
  const alreadyDone = !!today?.punch_out_at;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    api<{ attendance: AttendanceRecord | null }>('/attendance/today')
      .then((d) => setToday(d.attendance))
      .catch((e: Error) => { setToday(null); toast('error', e.message); });
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCamera = async () => {
    // getUserMedia only exists on HTTPS or localhost. Fail with a clear
    // message instead of a confusing generic one.
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('error', 'Camera requires a secure connection. Open this page over https:// or on localhost.');
      return;
    }

    stopCamera(); // never leak a previous stream on retake
    setLivenessOk(false);
    setMotionEvents(0);
    lastSigRef.current = null;
    setPhoto(null);

    // Location is requested alongside the camera so both are ready at capture
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setGeo('denied'),
        { enableHighAccuracy: true, timeout: 10_000 }
      );
    } else setGeo('denied');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      // NOTE: do NOT touch videoRef here — the <video> element isn't mounted
      // yet (it renders only when step === 'camera'). The effect below
      // attaches the stream once the element exists. Assigning here was the
      // race that produced a black preview.
      setStep('camera');
    } catch (err) {
      console.error('getUserMedia failed:', err);
      toast('error', cameraErrorMessage(err));
    }
  };

  // Attach the stream after the <video> element mounts.
  useEffect(() => {
    if (step !== 'camera') return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    // play() can reject with a benign AbortError if the element re-renders.
    video.play().catch(() => {});
  }, [step]);

  // Liveness sampling loop
  useEffect(() => {
    if (step !== 'camera') return;
    const timer = setInterval(() => {
      const video = videoRef.current, probe = probeRef.current;
      if (!video || !probe) return;
      const sig = frameSignature(video, probe);
      if (!sig) return;
      if (lastSigRef.current) {
        const d = diffScore(lastSigRef.current, sig);
        // Natural blink/head movement lands in this band. Below = static image;
        // far above = camera being waved around, which we also don't count.
        if (d > MOTION_MIN && d < MOTION_MAX) {
          setMotionEvents((n) => {
            const next = n + 1;
            if (next >= LIVENESS_EVENTS_NEEDED) setLivenessOk(true);
            return next;
          });
        }
      }
      lastSigRef.current = sig;
    }, 350);
    return () => clearInterval(timer);
  }, [step]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !livenessOk || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { toast('error', 'Could not capture the photo. Try again.'); return; }
    ctx.drawImage(video, 0, 0);
    setPhoto(canvas.toDataURL('image/jpeg', 0.85));
    stopCamera();
    setStep('captured');
  };

  const submit = async () => {
    if (!photo || step === 'submitting') return;
    setStep('submitting');
    try {
      const body = JSON.stringify({
        selfie: photo,
        lat: geo && geo !== 'denied' ? geo.lat : null,
        lng: geo && geo !== 'denied' ? geo.lng : null,
        livenessPassed: livenessOk,
      });
      const path = mode === 'in' ? '/attendance/punch-in' : '/attendance/punch-out';
      const data = await api<{ attendance: AttendanceRecord }>(path, { method: 'POST', body });
      setToday(data.attendance);
      setStep('done');
      toast('success', mode === 'in' ? 'Punched in. Have a good day!' : 'Punched out. See you tomorrow!');
      setTimeout(() => navigate('/app'), 1400);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setStep('captured');
    }
  };

  if (today === undefined) return <Skeleton className="h-96" />;

  if (alreadyDone) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center animate-rise">
        <CheckCircle2 size={44} className="text-jade-500" />
        <p className="font-display text-lg font-bold">You're done for today</p>
        <p className="text-sm text-ink-600/60 dark:text-mist-300/50">
          Punched in and out. Working hours are recorded on your home screen.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-rise">
      <div className="text-center">
        <h1 className="font-display text-xl font-extrabold">{mode === 'in' ? 'Punch in' : 'Punch out'}</h1>
        <p className="text-sm text-ink-600/60 dark:text-mist-300/50">
          Take a live selfie. Blink or move slightly so we know it's really you.
        </p>
      </div>

      <Card className="!p-3">
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-ink-900">
          {step === 'camera' && (
            <>
              <video ref={videoRef} playsInline muted autoPlay className="h-full w-full scale-x-[-1] object-cover" />
              {/* Face guide */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className={`h-3/5 w-1/2 rounded-[50%] border-4 transition-colors duration-500 ${livenessOk ? 'border-jade-400' : 'border-white/50'}`} />
              </div>
              <div className={`absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white backdrop-blur
                ${livenessOk ? 'bg-jade-500/80' : 'bg-ink-900/60'}`}>
                <ScanFace size={15} />
                {livenessOk ? 'Liveness confirmed' : 'Checking liveness — blink or turn your head slightly'}
              </div>
              {!livenessOk && (
                <div className="absolute left-3 top-3 h-1.5 w-24 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-saffron-400 transition-all"
                    style={{ width: `${Math.min(100, (motionEvents / LIVENESS_EVENTS_NEEDED) * 100)}%` }} />
                </div>
              )}
            </>
          )}
          {step !== 'camera' && photo && (
            <img src={photo} alt="Your selfie" className="h-full w-full scale-x-[-1] object-cover" />
          )}
          {step === 'idle' && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-mist-200">
              <div className="relative">
                <span className="absolute inset-0 rounded-full bg-cobalt-500 animate-pulseRing" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-cobalt-500">
                  <Camera size={26} className="text-white" />
                </div>
              </div>
              <p className="text-sm">Camera preview appears here</p>
            </div>
          )}
          {step === 'done' && (
            <div className="absolute inset-0 flex items-center justify-center bg-jade-500/85 animate-rise">
              <CheckCircle2 size={64} className="text-white" />
            </div>
          )}
        </div>
        <canvas ref={probeRef} className="hidden" />
      </Card>

      <div className="flex items-center justify-center gap-2 text-xs text-ink-600/60 dark:text-mist-300/50">
        <MapPin size={14} className={geo === 'denied' ? 'text-coral-500' : geo ? 'text-jade-500' : 'text-saffron-500'} />
        {geo === 'denied'
          ? 'Location unavailable — the punch is still recorded, without coordinates.'
          : geo
            ? `Location locked · ${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}`
            : 'Finding your location…'}
      </div>

      {step === 'idle' && (
        <Button className="w-full !py-4 text-base" onClick={startCamera}>
          <Camera size={18} /> Open camera
        </Button>
      )}
      {step === 'camera' && (
        <Button className="w-full !py-4 text-base" disabled={!livenessOk} onClick={capture}>
          {livenessOk ? 'Capture selfie' : 'Waiting for liveness…'}
        </Button>
      )}
      {(step === 'captured' || step === 'submitting') && (
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={startCamera} disabled={step === 'submitting'}>
            <RefreshCw size={16} /> Retake
          </Button>
          <Button className="flex-1" loading={step === 'submitting'} onClick={submit}>
            Confirm {mode === 'in' ? 'punch in' : 'punch out'}
          </Button>
        </div>
      )}
    </div>
  );
}