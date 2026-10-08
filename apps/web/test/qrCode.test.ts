import { describe, expect, it } from 'vitest';
import { codeFromQr } from '../src/surfaces/home/qrCode.js';

describe('code de partie lu dans un QR code', () => {
  it('reconnaît l’URL de l’écran central, quel que soit le domaine', () => {
    expect(codeFromQr('https://navale.sigilbo.fr/play/KRTX')).toBe('KRTX');
    expect(codeFromQr('https://192.168.1.20:5250/play/abcd?x=1')).toBe('ABCD');
    expect(codeFromQr('http://localhost:5260/play/PWWD/')).toBe('PWWD');
  });
  it('accepte un code nu et refuse le reste', () => {
    expect(codeFromQr('  krtx ')).toBe('KRTX');
    expect(codeFromQr('https://navale.sigilbo.fr/board/KRTX')).toBeNull();
    expect(codeFromQr('https://navale.sigilbo.fr/play/KRTXX')).toBeNull();
    expect(codeFromQr('https://navale.sigilbo.fr/play/KIOT')).toBeNull();
    expect(codeFromQr('bonjour')).toBeNull();
  });
});
