import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { findOrdersByMakroOrderNo } from '../lib/api/orders'

type FoundOrder = { id: string; customer_name_en: string; ship_date: string }

type Props = {
  /** Called only in the exactly-one-match case. */
  onFound: (order: FoundOrder) => void
  onClose: () => void
}

// Fixed id for the live-preview container Html5Qrcode renders its <video>
// into. One scanner is ever mounted at a time so a constant id is fine.
const SCANNER_ELEMENT_ID = 'qr-order-scanner-view'

/**
 * Live camera QR scanner for Makro shipping labels. The label's QR code
 * decodes to plain text = the order's `makro_order_no`, nothing else — every
 * decode is looked up with `findOrdersByMakroOrderNo` and the zero/one/many
 * cases are handled right here (only the exactly-one case is handed to the
 * parent via `onFound`).
 *
 * Uses `html5-qrcode`'s `getUserMedia`-based scanner, a different mechanism
 * from `PhotoCapture`'s file picker (see that file's header comment) — there
 * is no native-camera-app handoff step here to work around. Styled to match
 * this codebase's other camera-adjacent component: self-contained, owns its
 * own busy/error state, Thai copy, no external UI framework, no modal (just
 * a plain section — this app has none).
 */
export default function QrOrderScanner({ onFound, onClose }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const busyRef = useRef(false)
  // Set by BOTH the effect's unmount cleanup and the close button (unlike a
  // plain effect-local `cancelled` variable, which the close-button handler
  // has no way to reach). `start()`'s post-await continuation checks this to
  // know whether it should tear the camera back down instead of leaving it
  // running.
  const cancelledRef = useRef(false)
  const [starting, setStarting] = useState(true)
  const [cameraErr, setCameraErr] = useState('')
  const [retryMsg, setRetryMsg] = useState('')
  const [candidates, setCandidates] = useState<FoundOrder[] | null>(null)

  useEffect(() => {
    cancelledRef.current = false

    async function handleDecoded(decodedText: string) {
      if (busyRef.current) return
      busyRef.current = true
      setRetryMsg('')
      try {
        const orders = await findOrdersByMakroOrderNo(decodedText)
        if (orders.length === 0) {
          setRetryMsg(`ไม่พบออเดอร์เลข ${decodedText} กรุณาลองสแกนใหม่`)
          return
        }
        await stopCamera()
        if (orders.length === 1) {
          onFound(orders[0])
        } else {
          setCandidates(orders)
        }
      } catch (e) {
        await stopCamera()
        setCameraErr((e as Error).message || 'ค้นหาออเดอร์ไม่สำเร็จ')
      } finally {
        busyRef.current = false
      }
    }

    async function start() {
      // Captured in this closure so the post-await continuation below can
      // always reach the real scanner it started — even if `stopCamera()`
      // ran (from unmount or the close button) while `.start()` was still
      // pending and already nulled `scannerRef.current` in the meantime.
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID)
      scannerRef.current = scanner
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 250 },
          (decodedText) => {
            void handleDecoded(decodedText)
          },
          () => {
            // Per-frame "no QR found in this frame" — expected constantly
            // while scanning, not a real error.
          },
        )
        if (cancelledRef.current) {
          // Unmount or "ปิด" happened while `.start()` was still pending
          // (permission prompt / hardware init). The camera has *now*
          // actually attached, so stop this exact instance directly rather
          // than going through `stopCamera()` / `scannerRef.current`, which
          // may already have been nulled by that earlier teardown.
          await stopScannerInstance(scanner)
          return
        }
      } catch {
        if (!cancelledRef.current) {
          setCameraErr('เปิดกล้องไม่สำเร็จ กรุณาอนุญาตการใช้กล้องแล้วลองใหม่')
        }
      } finally {
        if (!cancelledRef.current) setStarting(false)
      }
    }

    start()
    return () => {
      cancelledRef.current = true
      void stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function stopScannerInstance(scanner: Html5Qrcode) {
    if (scannerRef.current === scanner) {
      scannerRef.current = null
    }
    if (scanner.isScanning) {
      try {
        await scanner.stop()
      } catch {
        // Ignore — component is unmounting or the camera already stopped.
      }
    }
  }

  async function stopCamera() {
    const scanner = scannerRef.current
    scannerRef.current = null
    if (scanner) {
      await stopScannerInstance(scanner)
    }
  }

  async function handleClose() {
    cancelledRef.current = true
    await stopCamera()
    onClose()
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
      {!candidates && (
        <>
          <div id={SCANNER_ELEMENT_ID} className="mx-auto w-full max-w-xs" />
          {starting && <p className="text-sm text-ink-soft">กำลังเปิดกล้อง…</p>}
          {retryMsg && <p className="text-sm text-danger-ink">{retryMsg}</p>}
        </>
      )}
      {cameraErr && <p className="text-sm text-danger-ink">{cameraErr}</p>}
      {candidates && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-soft">พบออเดอร์เลขนี้หลายรายการ กรุณาเลือก</p>
          <ul className="flex flex-col gap-1.5">
            {candidates.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm w-full justify-start"
                  onClick={() => onFound(o)}
                >
                  {o.customer_name_en} · {o.ship_date}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" className="btn btn-secondary btn-sm w-fit" onClick={handleClose}>
        ปิด
      </button>
    </div>
  )
}
