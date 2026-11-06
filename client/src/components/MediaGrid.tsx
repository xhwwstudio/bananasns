import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

interface MediaItem {
  type: string;
  url: string;
  poster?: string;
  cover?: string;
  title?: string;
  artist?: string;
  [key: string]: any;
}

export default function MediaGrid({ media = [] }: { media?: MediaItem[] }) {
  const [idx, setIdx] = useState<number | null>(null); // open image index, or null
  const [broken, setBroken] = useState<Set<number>>(new Set()); // cells whose image 404'd
  const [zoom, setZoom] = useState(1);
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgsAll = media.filter((m) => m.type === 'image');
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    if (idx === null) return;
    // 打开大图时锁住背景滚动；关闭后恢复
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [idx]);

  useEffect(() => {
    if (idx === null) return;
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [idx]);

  useEffect(() => {
    setZoom(1);
    setNat({ w: 0, h: 0 });
  }, [idx]);

  // 缩放后把滚动位置放到图片中心，长图/宽图都能从中间开始浏览
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
  }, [zoom, nat.w, nat.h, stage.w, stage.h, idx]);

  useEffect(() => {
    if (idx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIdx(null);
      else if (e.key === 'ArrowRight') setIdx((i) => ((i as number) + 1) % imgsAll.length);
      else if (e.key === 'ArrowLeft') setIdx((i) => ((i as number) - 1 + imgsAll.length) % imgsAll.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, imgsAll.length]);

  if (!media.length) return null;
  const images = media.filter((m) => m.type === 'image');
  const video = media.find((m) => m.type === 'video');
  const audio = media.find((m) => m.type === 'audio');

  if (video) {
    return (
      <div className="media-video" onClick={(e) => e.stopPropagation()}>
        {/* size to the video's natural aspect (height-capped + centered) so portrait
           clips don't get pillar-boxed with big black bars; landscape still fills width */}
        <video controls preload="metadata" poster={video.poster || undefined} playsInline
          src={video.url} className="media-video-el"
          onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoHeight > v.videoWidth) v.closest('.media-video')?.classList.add('portrait'); }} />
      </div>
    );
  }

  if (audio && !images.length) {
    return (
      <div className="audio-player" onClick={(e) => e.stopPropagation()}>
        <div className="audio-cover" style={audio.cover ? { backgroundImage: `url(${audio.cover})` } : {}}>
          {!audio.cover && <Icon name="music" size={26} />}
        </div>
        <div className="audio-body">
          <div className="audio-title">{audio.title || '未命名音频'}</div>
          {audio.artist && <div className="audio-artist">{audio.artist}</div>}
          <audio controls preload="none" src={audio.url} style={{ width: '100%', marginTop: 8, height: 34 }} />
        </div>
      </div>
    );
  }

  const n = Math.min(images.length, 9);
  const go = (e: React.MouseEvent, d: number) => { e.stopPropagation(); setIdx((i) => ((i as number) + d + imgsAll.length) % imgsAll.length); };
  const zoomBy = (d: number) => setZoom((z) => Math.max(1, Math.min(4, Math.round((z + d) * 100) / 100)));
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.changedTouches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 45 && imgsAll.length > 1) setIdx((i) => ((i as number) + (dx < 0 ? 1 : -1) + imgsAll.length) % imgsAll.length);
  };
  const fit = nat.w && stage.w && stage.h
    ? Math.min(stage.w / nat.w, stage.h / nat.h)
    : 1;
  const imgW = nat.w ? Math.max(1, Math.round(nat.w * fit * zoom)) : undefined;
  const imgH = nat.h ? Math.max(1, Math.round(nat.h * fit * zoom)) : undefined;
  return (
    <>
      <div className={`media-grid n${n}`} onClick={(e) => e.stopPropagation()}>
        {images.slice(0, 9).map((m, i) => (
          <div className={`media-cell${broken.has(i) ? ' media-cell-broken' : ''}`} key={i}
            onClick={() => { if (!broken.has(i)) setIdx(i); }}>
            {broken.has(i) ? (
              <span className="media-broken" aria-label="图片加载失败"><Icon name="image" size={22} /></span>
            ) : (
              <img src={m.url} alt="" loading="lazy" onError={() => setBroken((s) => new Set(s).add(i))} />
            )}
          </div>
        ))}
      </div>
      {idx !== null && createPortal(
        <div className="lightbox" onClick={() => setIdx(null)}>
          <button className="lb-close" aria-label="关闭" onClick={() => setIdx(null)}><Icon name="close" size={22} /></button>
          <div className="lb-toolbar" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => zoomBy(-0.25)} aria-label="缩小" disabled={zoom <= 1}>−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => zoomBy(0.25)} aria-label="放大" disabled={zoom >= 4}>+</button>
            <button type="button" className="lb-fit" onClick={() => setZoom(1)}>适应</button>
          </div>
          <div className={`lb-stage${zoom > 1 ? ' zoomed' : ''}`} ref={stageRef} onClick={(e) => e.stopPropagation()}>
            <img
              src={imgsAll[idx]?.url}
              alt=""
              draggable={false}
              onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2))}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              style={imgW && imgH ? { width: imgW, height: imgH } : undefined}
            />
          </div>
          {imgsAll.length > 1 && <button className="lb-nav lb-prev" aria-label="上一张" onClick={(e) => go(e, -1)}><Icon name="back" size={24} /></button>}
          {imgsAll.length > 1 && <button className="lb-nav lb-next" aria-label="下一张" onClick={(e) => go(e, 1)}><Icon name="back" size={24} style={{ transform: 'rotate(180deg)' }} /></button>}
          {imgsAll.length > 1 && <div className="lb-counter">{idx + 1} / {imgsAll.length}</div>}
        </div>,
        document.body,
      )}
    </>
  );
}
