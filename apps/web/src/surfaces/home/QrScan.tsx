import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QrScanner from 'qr-scanner';
import { codeFromQr } from './qrCode.js';

/**
 * Lecture du QR code de l'écran central avec la caméra arrière, sans quitter
 * l'application. Dès qu'un code de partie est reconnu, on rejoint.
 */
export function QrScan({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let done = false;
    const scanner = new QrScanner(
      video,
      (result) => {
        const code = codeFromQr(result.data);
        if (!code || done) return;
        done = true;
        scanner.stop();
        onCode(code);
      },
      {
        preferredCamera: 'environment',
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 8,
        returnDetailedScanResult: true,
      },
    );
    scanner.start().catch((err: unknown) => {
      const name = err instanceof Error ? err.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Autorise la caméra dans le navigateur, ou saisis le code à la main.'
          : 'Caméra indisponible. Saisis le code affiché sur l’écran central.',
      );
    });
    return () => {
      scanner.stop();
      scanner.destroy();
    };
  }, []);

  // Portail vers le corps de page : l'accueil a des ancêtres transformés qui piégeraient un calque fixe.
  return createPortal(
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Scanner le QR code">
      <video ref={videoRef} playsInline muted />
      <div className="scanner-ui">
        <p>{error ?? 'Vise le QR code de l’écran central'}</p>
        <button className="btn ghost" type="button" onClick={onClose}>
          {error ? 'Saisir le code' : 'Annuler'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
