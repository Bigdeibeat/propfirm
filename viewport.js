// Keep the navigation and focused fields inside the area above the keyboard.
// No Android bridge is required; native packaging can keep this web layout.
export function installViewport(app) {
  const viewport=window.visualViewport;
  let frame, focusFrame;
  const update=()=>{
    cancelAnimationFrame(frame);
    cancelAnimationFrame(focusFrame);
    frame=requestAnimationFrame(()=>{
      // Respect deliberate pinch zoom instead of resizing the app underneath it.
      if (viewport && Math.abs(viewport.scale-1)>.01) return;
      const height=viewport?.height ?? window.innerHeight;
      app.style.setProperty('--app-height',height+'px');
      app.style.setProperty('--viewport-top',(viewport?.offsetTop ?? 0)+'px');
      app.dataset.keyboard=String(height<window.innerHeight*.8);
      // Let native scroll anchoring finish the resize before revealing the field.
      focusFrame=requestAnimationFrame(revealFocusedField);
    });
  };
  const revealFocusedField=()=>{
    const input=document.activeElement;
    if (!app.contains(input) || !input.matches('input,textarea,select')) return;
    const scroller=input.closest('.journal-scroll,.history-scroll');
    if (!scroller) return;
    const bounds=scroller.getBoundingClientRect(), field=input.getBoundingClientRect();
    if (field.bottom>bounds.bottom-12) scroller.scrollTop+=field.bottom-bounds.bottom+12;
    else if (field.top<bounds.top+12) scroller.scrollTop+=field.top-bounds.top-12;
  };
  viewport?.addEventListener('resize',update);
  viewport?.addEventListener('scroll',update);
  window.addEventListener('resize',update);
  app.addEventListener('focusin',update);
  update();
}
