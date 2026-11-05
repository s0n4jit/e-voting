import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, ArrowsPointingInIcon } from '@heroicons/react/24/outline';

/**
 * Interactive Image Cropper Modal with 1:1 (Square) aspect ratio.
 * Zero external dependencies: uses HTML5 Canvas for fast, pixel-perfect cropping.
 */
export default function ImageCropperModal({ isOpen, imageSrc, onClose, onCropComplete }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);

  const containerRef = useRef(null);

  // Load image object whenever imageSrc changes
  useEffect(() => {
    if (!imageSrc) {
      setImage(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    img.onload = () => {
      setImage(img);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    };
  }, [imageSrc]);

  // Mouse / Pointer drag handlers
  const handlePointerDown = (e) => {
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handlePointerMove = (e) => {
    if (!dragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handlePointerUp = () => setDragging(false);

  // Wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY * -0.0015;
    setZoom((z) => Math.min(Math.max(0.5, z + delta), 4));
  };

  const doCrop = useCallback(() => {
    if (!image || !containerRef.current) return;
    setBusy(true);

    try {
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const cropW = rect.width;
      const cropH = rect.height;

      // Target canvas resolution (high-res 800x800 for 1:1 square)
      const targetW = 800;
      const targetH = 800;

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');

      // Scale factor from preview box to target canvas
      const scaleX = targetW / cropW;
      const scaleY = targetH / cropH;

      // Draw background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);

      // Calculate where image should be drawn
      // In preview, image was centered, offset by pan, scaled by zoom
      const imgAspect = image.width / image.height;
      const boxAspect = cropW / cropH;

      let drawW, drawH;
      if (imgAspect > boxAspect) {
        drawH = cropH * zoom;
        drawW = drawH * imgAspect;
      } else {
        drawW = cropW * zoom;
        drawH = drawW / imgAspect;
      }

      const drawX = (cropW - drawW) / 2 + pan.x;
      const drawY = (cropH - drawH) / 2 + pan.y;

      // Map to target canvas
      ctx.drawImage(
        image,
        drawX * scaleX,
        drawY * scaleY,
        drawW * scaleX,
        drawH * scaleY
      );

      canvas.toBlob(
        (blob) => {
          setBusy(false);
          if (blob) {
            const croppedFile = new File([blob], 'candidate-photo.jpg', {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            onCropComplete(croppedFile, URL.createObjectURL(blob));
          }
        },
        'image/jpeg',
        0.92
      );
    } catch {
      setBusy(false);
    }
  }, [image, zoom, pan, onCropComplete]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Crop Candidate Photo (1:1)" maxWidth="max-w-md">
      <div className="space-y-4">
        {/* Viewport Box */}
        <div className="relative w-full flex items-center justify-center bg-slate-950/80 rounded-2xl overflow-hidden p-4 select-none">
          <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
            style={{
              width: '280px',
              height: '280px',
              cursor: dragging ? 'grabbing' : 'grab',
            }}
            className="relative overflow-hidden rounded-xl border-2 border-dashed border-white/80 shadow-2xl flex items-center justify-center bg-slate-900"
          >
            {image && (
              <img
                src={imageSrc}
                alt="To crop"
                draggable={false}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  pointerEvents: 'none',
                }}
                className="transition-transform duration-75 select-none"
              />
            )}

            {/* Grid overlay */}
            <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-white/20">
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />
              <div className="border-r border-white/20" />
              <div className="border-r border-white/20" />
              <div />
            </div>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-3 px-2">
          <button
            type="button"
            className="btn-ghost p-1.5 text-muted hover:text-fg"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
            title="Zoom out"
          >
            <MagnifyingGlassMinusIcon className="w-5 h-5" />
          </button>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="flex-1 accent-brand h-1.5 bg-line rounded-lg cursor-pointer"
          />
          <button
            type="button"
            className="btn-ghost p-1.5 text-muted hover:text-fg"
            onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
            title="Zoom in"
          >
            <MagnifyingGlassPlusIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="btn-ghost p-1.5 text-muted hover:text-fg"
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            title="Reset position"
          >
            <ArrowsPointingInIcon className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-muted text-center">
          Drag to reposition the image. Scroll or use the slider to zoom.
        </p>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={doCrop} disabled={busy || !image}>
            {busy ? 'Cropping…' : 'Apply Crop'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
