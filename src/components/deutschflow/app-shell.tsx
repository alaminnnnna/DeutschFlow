'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from 'framer-motion';
import {
  AudioLines,
  BarChart3,
  BookOpen,
  History as HistoryIcon,
  Repeat,
  Settings as SettingsIcon,
} from 'lucide-react';

import { useVocab } from '@/lib/vocabulary';

export type Section = 'listen' | 'vocabulary' | 'review' | 'history' | 'progress' | 'settings';

interface NavItem {
  id: Section;
  label: string;
  bangla: string;
  icon: LucideIcon;
  /** Included in the floating mobile tab bar (5 fit comfortably at 320px). */
  mobile: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'listen', label: 'Listen', bangla: 'শোনো', icon: AudioLines, mobile: true },
  { id: 'vocabulary', label: 'Vocabulary', bangla: 'শব্দ', icon: BookOpen, mobile: true },
  { id: 'review', label: 'Review', bangla: 'রিভিউ', icon: Repeat, mobile: true },
  { id: 'progress', label: 'Progress', bangla: 'প্রগ্রেস', icon: BarChart3, mobile: true },
  { id: 'history', label: 'History', bangla: 'ইতিহাস', icon: HistoryIcon, mobile: false },
  { id: 'settings', label: 'Settings', bangla: 'সেটিংস', icon: SettingsIcon, mobile: true },
];

// ── Liquid-glass indicator ────────────────────────────────────────────
//
// The active capsule is driven by measured element positions — never by
// hardcoded coordinates — so it stays glued to the selected item across
// resizes, orientation changes, font loading and route changes. Movement is
// transform-only (x/y + springs); velocity-derived scaleX/scaleY make the
// capsule subtly stretch along its travel axis, then settle back to exactly
// 1 (a scale factor must rest at 1 — resting at 0 would collapse the capsule
// to zero width). Animation state lives entirely inside this hook, so section
// switches never rerender page content.

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SPRING = { stiffness: 480, damping: 38, mass: 0.9 } as const;
const STRETCH_SPRING = { stiffness: 420, damping: 40 } as const;
/** Grab magnification + soft glassy wobble on release. */
const ZOOM_SPRING = { stiffness: 420, damping: 26, mass: 0.9 } as const;

/** Pointer travel needed before a press becomes a capsule drag (px). */
const DRAG_THRESHOLD = 8;
/** Releases up to this far outside the bar still count as a drop inside (px). */
const DROP_MARGIN = 40;
/** How far the capsule may drift past the first/last item (rubber-banded). */
const OVERHANG = 36;
/** LOCKED to the bar: at most this far off its rail across the nav axis —
 *  a subtle glassy give under the finger, never an escape into the page. */
const CROSS_RANGE = 12;
/** Distance from an item centre where the magnet starts pulling (px). */
const MAGNET_RADIUS = 64;

/** Peak travel velocity adds up to 20% stretch along the movement axis. */
const stretchOf = (v: number) => 1 + Math.min(0.2, Math.abs(v) / 2600);
/** Glass is incompressible — stretching one axis squashes the other a little. */
const squashOf = (s: number) => 1 - (s - 1) * 0.45;
/** Fast movement also swells the whole capsule — the liquid "zoom" feel. */
const swellOf = (speed: number) => 1 + Math.min(0.06, speed / 9000);
/** Uniform magnification while the capsule is grabbed (iOS-style). */
const DRAG_ZOOM = 1.08;

/** iOS scroll-rail rubber band: resistance grows, offset never exceeds dim. */
const rubber = (offset: number, dim: number) => {
  const x = Math.abs(offset);
  if (x === 0) return 0;
  return Math.sign(offset) * (1 - 1 / (x / dim + 1)) * dim;
};

/** Free movement inside [lo, hi], elastic resistance past the edges. */
const rubberClamp = (v: number, lo: number, hi: number, dim: number) =>
  v < lo ? lo + rubber(v - lo, dim) : v > hi ? hi + rubber(v - hi, dim) : v;

/** Placement must land before paint (no late pop-in / stale-frame flash);
 *  useLayoutEffect does not exist on the server, so fall back to useEffect. */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface DragGesture {
  pointerId: number;
  startX: number;
  startY: number;
  /** Active item's rect at grab time, in ul content coordinates. */
  home: Rect;
  /** Last (magnet-adjusted) capsule position along the nav axis. */
  lastPos: number;
  /** True once the press crossed the drag threshold. */
  dragging: boolean;
  /** Smoothed pointer velocity (px/s) — feeds the liquid stretch. */
  velX: number;
  velY: number;
  prevX: number;
  prevY: number;
  lastT: number;
  /** performance.now() of the last move — drives the idle-decay loop. */
  lastMoveWall: number;
  /** rAF handle of the idle-decay loop. */
  raf: number | null;
  ul: HTMLUListElement;
  stop: () => void;
}

function useLiquidNav(
  count: number,
  activeIndex: number,
  axis: 'x' | 'y',
  onActivate?: (id: Section) => void,
) {
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const rectsRef = useRef<Array<Rect | null>>([]);
  const gestureRef = useRef<DragGesture | null>(null);
  /** Set after a real drag ends — swallows the leftover pointer click once. */
  const swallowClickRef = useRef(false);
  const placedRef = useRef(false);
  const reduced = useReducedMotion();
  const [rect, setRect] = useState<Rect | null>(null);

  const measure = useCallback(() => {
    // Every item's box, in ul content coordinates (offset* ignores transforms,
    // so the capsule's own position can never skew the numbers). Boxes below
    // 8px are transient mid-layout reads (breakpoint flips, window restores)
    // — treating them as invalid keeps a 2px sliver capsule from ever
    // becoming the measured truth.
    rectsRef.current = itemRefs.current.map((el) =>
      el && el.offsetWidth >= 8 && el.offsetHeight >= 8
        ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
        : null,
    );
    setRect(rectsRef.current[activeIndex] ?? null);
  }, [activeIndex]);

  useIsomorphicLayoutEffect(() => {
    if (activeIndex < 0) {
      setRect(null);
      return;
    }
    measure();
    const el = itemRefs.current[activeIndex];
    const container = (el?.offsetParent as HTMLElement | null) ?? null;
    const onResize = () => {
      measure();
      requestAnimationFrame(measure);
    };
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }
    const ro = new ResizeObserver(() => {
      measure();
      // Self-heal transient mid-layout boxes: re-read once the frame settles.
      requestAnimationFrame(measure);
    });
    if (el) ro.observe(el);
    if (container) ro.observe(container);
    // Font swap changes item widths — re-measure once fonts settle.
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    fonts?.ready.then(() => measure()).catch(() => {});
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [measure, activeIndex, count]);

  const x = useSpring(0, SPRING);
  const y = useSpring(0, SPRING);
  const w = useSpring(0, SPRING);
  const h = useSpring(0, SPRING);

  useIsomorphicLayoutEffect(() => {
    if (gestureRef.current?.dragging) return; // never fight an active drag
    if (!rect) {
      // Capsule hidden — the next valid rect is a fresh placement, not a
      // travel animation from stale coordinates.
      placedRef.current = false;
      return;
    }
    if (reduced || !placedRef.current) {
      // First placement (or reduced motion): no travel animation.
      x.jump(rect.x);
      y.jump(rect.y);
      w.jump(rect.w);
      h.jump(rect.h);
      placedRef.current = true;
    } else {
      x.set(rect.x);
      y.set(rect.y);
      w.set(rect.w);
      h.set(rect.h);
    }
  }, [rect, reduced, x, y, w, h]);

  // Liquid deformation. Travelling springs and drags both feed per-axis
  // velocity: movement stretches the capsule along its direction, squashes
  // the perpendicular axis (glass is incompressible) and swells it slightly
  // with speed — while grabbing magnifies it iOS-style. Every factor rests
  // at exactly 1, so the capsule always settles back to its measured bounds.
  const velX = useVelocity(x);
  const velY = useVelocity(y);
  // Drag velocity is tracked manually — jump() zeroes the springs' own velocity.
  const dragVelX = useMotionValue(0);
  const dragVelY = useMotionValue(0);
  const stretchX = useSpring(
    useTransform([velX, dragVelX], ([a, b]: number[]) => stretchOf(Math.abs(a) + Math.abs(b))),
    STRETCH_SPRING,
  );
  const stretchY = useSpring(
    useTransform([velY, dragVelY], ([a, b]: number[]) => stretchOf(Math.abs(a) + Math.abs(b))),
    STRETCH_SPRING,
  );
  const swell = useSpring(
    useTransform([velX, velY, dragVelX, dragVelY], ([a, b, c, d]: number[]) =>
      swellOf(Math.hypot(Math.abs(a) + Math.abs(c), Math.abs(b) + Math.abs(d))),
    ),
    STRETCH_SPRING,
  );
  const dragScale = useSpring(1, ZOOM_SPRING);
  const scaleX = useTransform(
    [dragScale, swell, stretchX, stretchY],
    ([ds, sw, sx, sy]: number[]) => ds * sw * sx * squashOf(sy),
  );
  const scaleY = useTransform(
    [dragScale, swell, stretchX, stretchY],
    ([ds, sw, sx, sy]: number[]) => ds * sw * sy * squashOf(sx),
  );
  const [dragging, setDragging] = useState(false);

  /** Spring the capsule into an item's exact bounds; jumps under reduced motion. */
  const placeAt = useCallback(
    (r: Rect) => {
      if (reduced) {
        x.jump(r.x);
        y.jump(r.y);
        w.jump(r.w);
        h.jump(r.h);
      } else {
        x.set(r.x);
        y.set(r.y);
        w.set(r.w);
        h.set(r.h);
      }
    },
    [reduced, x, y, w, h],
  );

  /** Release the grab: bleed velocity, wobble the magnification back to 1. */
  const settleDragVisuals = useCallback(() => {
    dragVelX.set(0);
    dragVelY.set(0);
    if (reduced) {
      dragScale.jump(1);
    } else {
      dragScale.set(1); // springs back with a soft glassy wobble
    }
    setDragging(false);
  }, [dragVelX, dragVelY, dragScale, reduced]);

  /** End the gesture; a dragged capsule springs back to the active item. */
  const abortGesture = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    const wasDragging = gesture.dragging;
    gestureRef.current = null;
    gesture.stop();
    if (wasDragging) {
      settleDragVisuals();
      const r = rectsRef.current[activeIndex];
      if (r) placeAt(r);
    }
  }, [activeIndex, placeAt, settleDragVisuals]);

  // ── Draggable liquid capsule ──────────────────────────────────────
  //
  // Press the ACTIVE item and move past a small threshold to grab the glass
  // capsule; it then follows the pointer 1:1 in EVERY direction (MotionValue
  // writes only — no React renders per move, no spring lag during direct
  // manipulation) with elastic rubber-band resistance past the bar's edges
  // and a magnetic pull toward the nearest item's centre, so it leans into
  // its next home as the pointer approaches. Releasing over/near the bar
  // drops it on the nearest item and navigates there; releasing further out,
  // losing the capture or cancelling returns it to the current route without
  // navigating. Sub-threshold presses stay ordinary clicks, so clicking and
  // keyboard behaviour are untouched.

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (gestureRef.current) return; // a gesture already owns this pointer
      swallowClickRef.current = false;
      const ul = e.currentTarget;
      const btn = (e.target as HTMLElement).closest?.('button[data-nav-item]');
      // Only the active item's capsule is grabbable — every other tab keeps
      // its plain click behaviour.
      if (!btn || btn !== itemRefs.current[activeIndex]) return;
      const home = rectsRef.current[activeIndex];
      if (!home) return;
      const rects = rectsRef.current.filter(Boolean) as Rect[];
      if (rects.length === 0) return;
      const size = axis === 'x' ? home.w : home.h;
      // Rail limits: free across every item, elastic past the bar's ends.
      const lo = Math.min(...rects.map((r) => (axis === 'x' ? r.x : r.y))) - OVERHANG;
      const hi =
        Math.max(...rects.map((r) => (axis === 'x' ? r.x + r.w : r.y + r.h))) -
        size +
        OVERHANG;
      const centers = rects.map((r) => (axis === 'x' ? r.x + r.w / 2 : r.y + r.h / 2));

      let gesture: DragGesture;

      /** Smooth per-event velocity — feeds the liquid stretch while dragging. */
      const track = (ev: PointerEvent) => {
        const dt = ev.timeStamp - gesture.lastT;
        gesture.lastT = ev.timeStamp;
        if (dt > 0 && dt < 120) {
          const instX = ((ev.clientX - gesture.prevX) / dt) * 1000;
          const instY = ((ev.clientY - gesture.prevY) / dt) * 1000;
          gesture.velX += (instX - gesture.velX) * 0.35;
          gesture.velY += (instY - gesture.velY) * 0.35;
        } else if (dt >= 120) {
          gesture.velX = 0;
          gesture.velY = 0;
        }
        gesture.prevX = ev.clientX;
        gesture.prevY = ev.clientY;
        gesture.lastMoveWall = performance.now();
      };

      /** rAF loop: when the pointer pauses mid-drag, bleed the velocity to
       *  zero so the stretch settles instead of freezing mid-deformation. */
      const decay = () => {
        if (gestureRef.current !== gesture || !gesture.dragging) return;
        if (
          performance.now() - gesture.lastMoveWall > 80 &&
          (gesture.velX !== 0 || gesture.velY !== 0)
        ) {
          gesture.velX *= 0.86;
          gesture.velY *= 0.86;
          if (Math.abs(gesture.velX) < 24) gesture.velX = 0;
          if (Math.abs(gesture.velY) < 24) gesture.velY = 0;
          dragVelX.set(gesture.velX);
          dragVelY.set(gesture.velY);
        }
        gesture.raf = requestAnimationFrame(decay);
      };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== gesture.pointerId) return;
        if (!gesture.dragging) {
          if (
            Math.hypot(ev.clientX - gesture.startX, ev.clientY - gesture.startY) <
            DRAG_THRESHOLD
          )
            return;
          gesture.dragging = true;
          try {
            // Keep receiving events even when the pointer leaves the capsule.
            gesture.ul.setPointerCapture(gesture.pointerId);
          } catch {
            /* window listeners below keep the drag alive regardless */
          }
          if (!reduced) dragScale.set(DRAG_ZOOM); // grab: the glass swells
          setDragging(true); // lift the capsule (stronger shadow)
          // Guarantee a full-size capsule at grab even if a placement was
          // still pending (breakpoint flip, first paint) — and mark it
          // placed so the next apply pass springs instead of jumping.
          x.jump(gesture.home.x);
          y.jump(gesture.home.y);
          w.jump(gesture.home.w);
          h.jump(gesture.home.h);
          placedRef.current = true;
          gesture.raf = requestAnimationFrame(decay);
        }
        ev.preventDefault(); // no text selection / native drag mid-gesture
        track(ev);

        // Free 2D placement from the grab-time home, rubber-banded at every
        // edge — the capsule may drift off the bar in any direction.
        const railRaw =
          (axis === 'x' ? gesture.home.x : gesture.home.y) +
          (axis === 'x' ? ev.clientX - gesture.startX : ev.clientY - gesture.startY);
        const homeCross = axis === 'x' ? gesture.home.y : gesture.home.x;
        const crossRaw =
          homeCross +
          (axis === 'x' ? ev.clientY - gesture.startY : ev.clientX - gesture.startX);
        let rail = rubberClamp(railRaw, lo, hi, OVERHANG);
        // HARD-LOCKED cross rail: a pure elastic envelope around home that
        // the capsule can never exceed (rubber() saturates exactly at
        // CROSS_RANGE) — a glassy give under the finger, zero escape.
        let cross = homeCross + rubber(crossRaw - homeCross, CROSS_RANGE);

        // Magnetic pull toward the nearest item centre: gentle far away,
        // committed close in — the capsule leans into its next home.
        const center = rail + size / 2;
        let best = -1;
        let bestDist = Number.POSITIVE_INFINITY;
        centers.forEach((c, i) => {
          const d = Math.abs(c - center);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        if (best >= 0 && bestDist < MAGNET_RADIUS) {
          const pull = Math.min(1, (1 - bestDist / MAGNET_RADIUS) ** 2 * 1.6);
          rail += (centers[best] - size / 2 - rail) * pull;
          const crossTarget = axis === 'x' ? rects[best].y : rects[best].x;
          cross += (crossTarget - cross) * pull * 0.55;
        }

        gesture.lastPos = rail;
        // 1:1 direct manipulation — jump(), so the rendering spring can never
        // lag the finger; the release placement below does the springing.
        if (axis === 'x') {
          x.jump(rail);
          y.jump(cross);
        } else {
          y.jump(rail);
          x.jump(cross);
        }
        if (!reduced) {
          dragVelX.set(gesture.velX);
          dragVelY.set(gesture.velY);
        }
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== gesture.pointerId) return;
        const wasDragging = gesture.dragging;
        gestureRef.current = null;
        gesture.stop();
        if (!wasDragging) return; // plain click — the button's onClick handles it
        settleDragVisuals();
        swallowClickRef.current = true; // the release click is ours to own

        // Drop test: the pointer must be over (or near) the bar; anything
        // further out counts as a cancelled drop and returns the capsule to
        // the active item without navigating.
        const drop = gesture.ul.getBoundingClientRect();
        const insideBar =
          ev.clientX >= drop.left - DROP_MARGIN &&
          ev.clientX <= drop.right + DROP_MARGIN &&
          ev.clientY >= drop.top - DROP_MARGIN &&
          ev.clientY <= drop.bottom + DROP_MARGIN;

        // Decide from the capsule's logical (magnet-adjusted) centre, never
        // from the rendering spring — it can trail the pointer.
        const capsuleCenter = gesture.lastPos + size / 2;
        let best = -1;
        let bestDist = Number.POSITIVE_INFINITY;
        rectsRef.current.forEach((r, i) => {
          if (!r) return;
          const center = axis === 'x' ? r.x + r.w / 2 : r.y + r.h / 2;
          const dist = Math.abs(center - capsuleCenter);
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
        });

        const target = best >= 0 ? rectsRef.current[best] : null;
        const targetId =
          best >= 0
            ? (itemRefs.current[best]?.getAttribute('data-nav-id') as Section | null)
            : null;
        if (insideBar && target && targetId) {
          placeAt(target); // settle exactly into the item's bounds
          if (targetId !== NAV_ITEMS[activeIndex]?.id) onActivate?.(targetId);
        } else {
          const r = rectsRef.current[activeIndex];
          if (r) placeAt(r); // dropped outside — return without navigating
        }
      };

      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId !== gesture.pointerId) return;
        abortGesture();
      };

      /** Touch veto: some mobile browsers still try to claim a drag for
       *  scrolling/gesture detection mid-move (pointercancel) even under
       *  touch-action, so a non-passive touchmove preventDefault guarantees
       *  the finger owns the capsule until release. Mouse drags skip it. */
      const onTouchMove = (ev: TouchEvent) => {
        if (gesture.dragging && ev.cancelable) ev.preventDefault();
      };

      gesture = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        home,
        lastPos: axis === 'x' ? home.x : home.y,
        dragging: false,
        velX: 0,
        velY: 0,
        prevX: e.clientX,
        prevY: e.clientY,
        lastT: e.timeStamp,
        lastMoveWall: 0,
        raf: null,
        ul,
        stop: () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onCancel);
          window.removeEventListener('touchmove', onTouchMove);
          if (gesture.raf !== null) cancelAnimationFrame(gesture.raf);
          gesture.raf = null;
        },
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      if (e.pointerType === 'touch') {
        window.addEventListener('touchmove', onTouchMove, { passive: false });
      }
      gestureRef.current = gesture;
    },
    [
      abortGesture,
      activeIndex,
      axis,
      dragScale,
      dragVelX,
      dragVelY,
      h,
      onActivate,
      placeAt,
      reduced,
      settleDragVisuals,
      w,
      x,
      y,
    ],
  );

  /** Unexpected capture loss mid-drag (element removed, browser takeover). */
  const onLostCapture = useCallback(() => {
    if (gestureRef.current?.dragging) abortGesture();
  }, [abortGesture]);

  /** After a real drag, the release click must not navigate a second time —
   *  swallow exactly that pointer-initiated click. Keyboard activation
   *  (detail === 0) always passes through untouched. */
  const onClickCapture = useCallback(
    (e: React.MouseEvent<HTMLUListElement>) => {
      if (swallowClickRef.current && e.detail > 0) {
        e.preventDefault();
        e.stopPropagation();
        swallowClickRef.current = false;
      }
    },
    [],
  );

  // Unmounting mid-gesture: detach the window listeners.
  useEffect(
    () => () => {
      gestureRef.current?.stop();
      gestureRef.current = null;
    },
    [],
  );

  return {
    itemRefs,
    rect,
    x,
    y,
    w,
    h,
    scaleX,
    scaleY,
    dragging,
    onPointerDown,
    onLostCapture,
    onClickCapture,
  };
}

/** Roving focus inside a nav list: arrows move focus, Enter activates. */
function handleNavKeys(e: React.KeyboardEvent<HTMLUListElement>) {
  const buttons = Array.from(
    e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-nav-item]')
  );
  if (buttons.length === 0) return;
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  let next = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % buttons.length;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = buttons.length - 1;
  if (next >= 0) {
    e.preventDefault();
    buttons[next].focus();
  }
}

interface AppShellProps {
  section: Section;
  onSectionChange: (section: Section) => void;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ section, onSectionChange, headerRight, children }: AppShellProps) {
  const entries = useVocab((s) => s.entries);
  const now = Date.now();
  const dueCount = entries.reduce((n, e) => n + (e.review.dueAt <= now ? 1 : 0), 0);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* ── Desktop floating glass dock ─────────────────────────────── */}
      <DesktopDock section={section} onSectionChange={onSectionChange} dueCount={dueCount} />

      {/* ── Content column ──────────────────────────────────────────── */}
      <div className="flex min-h-screen flex-1 flex-col">
        {/* Top bar (functional layer) */}
        <header className="sticky top-0 z-20 border-b border-border/60 bg-background/75 backdrop-blur-xl">
          <div className="flex w-full items-center justify-between gap-2 px-4 py-3 lg:px-6">
            <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <AudioLines className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[15px] font-bold tracking-tight">
                  Deutsch<span className="text-primary">Flow</span>
                </p>
                <p className="truncate text-[11px] text-muted-foreground font-bangla">
                  {NAV_ITEMS.find((n) => n.id === section)?.bangla ?? 'শোনো'}
                </p>
              </div>
            </div>
            <p className="hidden text-sm font-semibold text-muted-foreground lg:block">
              {NAV_ITEMS.find((n) => n.id === section)?.label}
            </p>
            <div className="flex shrink-0 items-center gap-0.5">{headerRight}</div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-36 pt-2 sm:px-6 lg:pb-12 lg:pl-6 lg:pr-8">
          {children}
        </main>

        {/* Desktop footer — mt-auto keeps it stuck to the bottom */}
        <footer className="mt-auto hidden border-t border-border/60 bg-background/80 lg:block">
          <p className="px-6 py-4 text-[11px] leading-relaxed text-muted-foreground font-bangla">
            DeutschFlow — জার্মান শেখার দৈনিক সঙ্গী · ইতিহাস, শব্দভান্ডার ও সেটিংস সব
            localStorage/IndexedDB-তে সরিয়ে রাখা হয় · ভয়েস ইঞ্জিন ডিভাইসভেদে ভিন্ন হতে পারে
          </p>
        </footer>
      </div>

      {/* ── Floating glass tab bar (mobile, functional layer) ───────── */}
      <FloatingTabBar section={section} onSectionChange={onSectionChange} dueCount={dueCount} />
    </div>
  );
}

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
      {count > 99 ? '99+' : count}
    </span>
  );
}

function DesktopDock({
  section,
  onSectionChange,
  dueCount,
}: {
  section: Section;
  onSectionChange: (s: Section) => void;
  dueCount: number;
}) {
  const activeIndex = NAV_ITEMS.findIndex((n) => n.id === section);
  const {
    itemRefs,
    rect,
    x,
    y,
    w,
    h,
    scaleX,
    scaleY,
    dragging,
    onPointerDown,
    onLostCapture,
    onClickCapture,
  } = useLiquidNav(NAV_ITEMS.length, activeIndex, 'y', onSectionChange);

  return (
    <aside className="hidden lg:block lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:w-64 lg:shrink-0">
      <div className="flex h-[calc(100vh-1.5rem)] flex-col m-3 rounded-[26px] border border-border/60 bg-card/70 shadow-[0_12px_36px_-14px_rgba(15,26,46,0.28)] backdrop-blur-xl">
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <AudioLines className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-tight">
              Deutsch<span className="text-primary">Flow</span>
            </p>
            <p className="text-[11px] text-muted-foreground">German · A1 → B1</p>
          </div>
        </div>
        <nav aria-label="Main sections" className="flex-1 overflow-y-auto px-3 py-2">
          <ul
            onKeyDown={handleNavKeys}
            onPointerDown={onPointerDown}
            onLostPointerCapture={onLostCapture}
            onClickCapture={onClickCapture}
            className="relative touch-none select-none space-y-1"
          >
            {rect && (
              <motion.span
                aria-hidden="true"
                className={`absolute left-0 top-0 rounded-xl border bg-accent transition-[box-shadow,border-color] duration-200 ${
                  dragging
                    ? 'border-border/70 shadow-[0_18px_38px_-12px_rgba(15,26,46,0.45),inset_0_1px_0_rgba(255,255,255,0.55)]'
                    : 'border-border/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]'
                }`}
                style={{
                  x,
                  y,
                  width: w,
                  height: h,
                  scaleX,
                  scaleY,
                }}
              />
            )}
            {NAV_ITEMS.map((item, i) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    data-nav-item
                    data-nav-id={item.id}
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    onClick={() => onSectionChange(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? 'cursor-grab touch-none text-accent-foreground active:cursor-grabbing'
                        : 'touch-pan-x touch-pinch-zoom text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    }`}
                  >
                    <Icon className="relative z-10 h-[18px] w-[18px]" aria-hidden="true" />
                    <span className="relative z-10 flex-1">{item.label}</span>
                    <span className="relative z-10 text-[11px] font-bangla opacity-70">
                      {item.bangla}
                    </span>
                    {item.id === 'review' && dueCount > 0 && (
                      <span className="relative z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                        {dueCount > 99 ? '99+' : dueCount}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="px-5 pb-5 text-[11px] leading-relaxed text-muted-foreground font-bangla">
          সব ডেটা তোমার ব্রাউজারেই থাকে · কোনো অ্যাকাউন্ট লাগে না
        </p>
      </div>
    </aside>
  );
}

function FloatingTabBar({
  section,
  onSectionChange,
  dueCount,
}: {
  section: Section;
  onSectionChange: (s: Section) => void;
  dueCount: number;
}) {
  const items = NAV_ITEMS.filter((n) => n.mobile);
  // History is reachable on mobile (see-all in Listen) but absent from this
  // bar — activeIndex is -1 then and the capsule hides instead of parking on
  // the first tab.
  const activeIndex = items.findIndex((n) => n.id === section);
  const {
    itemRefs,
    rect,
    x,
    y,
    w,
    h,
    scaleX,
    scaleY,
    dragging,
    onPointerDown,
    onLostCapture,
    onClickCapture,
  } = useLiquidNav(items.length, activeIndex, 'x', onSectionChange);

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[calc(env(safe-area-inset-bottom)+12px)] lg:hidden"
    >
      <ul
        onKeyDown={handleNavKeys}
        onPointerDown={onPointerDown}
        onLostPointerCapture={onLostCapture}
        onClickCapture={onClickCapture}
        className="df-nav-glass pointer-events-auto relative flex touch-none select-none items-center gap-0.5 rounded-[26px] border border-border/70 bg-card/72 p-1.5 shadow-[0_12px_36px_-10px_rgba(15,26,46,0.35)] backdrop-blur-2xl backdrop-saturate-150"
      >
        {rect && (
          <motion.span
            aria-hidden="true"
            className={`absolute left-0 top-0 rounded-[20px] border bg-accent transition-[box-shadow,border-color] duration-200 ${
              dragging
                ? 'border-border/70 shadow-[0_18px_38px_-12px_rgba(15,26,46,0.45),inset_0_1px_0_rgba(255,255,255,0.55)]'
                : 'border-border/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]'
            }`}
            style={{
              x,
              y,
              width: w,
              height: h,
              scaleX,
              scaleY,
            }}
          />
        )}
        {items.map((item, i) => {
          const Icon = item.icon;
          const active = section === item.id;
          const showBadge = item.id === 'review' && dueCount > 0;
          return (
            <li key={item.id}>
              <button
                type="button"
                data-nav-item
                data-nav-id={item.id}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                onClick={() => onSectionChange(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex h-[52px] w-[58px] flex-col items-center justify-center gap-0.5 rounded-[20px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.94] ${
                  active
                    ? 'cursor-grab touch-none text-primary active:cursor-grabbing'
                    : 'touch-pan-y touch-pinch-zoom text-muted-foreground'
                }`}
              >
                <span className="relative z-10 flex items-center">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {showBadge && <NavBadge count={dueCount} />}
                </span>
                <span className="relative z-10 text-[10px] font-medium font-bangla">
                  {item.bangla}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
