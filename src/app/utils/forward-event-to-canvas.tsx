// utils/canvasEventForwarder.ts

export function forwardEventToCanvas(
  originalEvent: MouseEvent | WheelEvent | PointerEvent,
  canvas: HTMLCanvasElement | null
): void {
  if (!canvas) return;

  const eventInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: (originalEvent as MouseEvent).clientX,
    clientY: (originalEvent as MouseEvent).clientY,
    screenX: (originalEvent as MouseEvent).screenX,
    screenY: (originalEvent as MouseEvent).screenY,
    ctrlKey: originalEvent.ctrlKey,
    shiftKey: originalEvent.shiftKey,
    altKey: originalEvent.altKey,
    metaKey: originalEvent.metaKey,
    button: (originalEvent as MouseEvent).button,
    buttons: (originalEvent as MouseEvent).buttons,
    relatedTarget: (originalEvent as MouseEvent).relatedTarget,
    view: window
  };

  if (originalEvent.type.includes("wheel")) {
    const wheelOriginal = originalEvent as WheelEvent;
    const wheelEvent = new WheelEvent(originalEvent.type, {
      ...eventInit,
      deltaX: wheelOriginal.deltaX,
      deltaY: wheelOriginal.deltaY,
      deltaZ: wheelOriginal.deltaZ,
      deltaMode: wheelOriginal.deltaMode
    });
    canvas.dispatchEvent(wheelEvent);
  } else if (originalEvent.type.includes("mouse")) {
    const mouseEvent = new MouseEvent(originalEvent.type, eventInit);
    canvas.dispatchEvent(mouseEvent);
  } else if (originalEvent.type.includes("pointer")) {
    const pointerOriginal = originalEvent as PointerEvent;
    const pointerEvent = new PointerEvent(originalEvent.type, {
      ...eventInit,
      pointerId: pointerOriginal.pointerId,
      pointerType: pointerOriginal.pointerType,
      width: pointerOriginal.width,
      height: pointerOriginal.height,
      pressure: pointerOriginal.pressure,
      tiltX: pointerOriginal.tiltX,
      tiltY: pointerOriginal.tiltY
    });
    canvas.dispatchEvent(pointerEvent);
  }
}
