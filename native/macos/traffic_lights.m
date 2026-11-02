#import <Cocoa/Cocoa.h>
#include <stdint.h>

static void placeTrafficLights(void *nsview, double originX, double gap) {
  NSView *view = (__bridge NSView *)nsview;
  if (view == nil) return;
  NSWindow *window = view.window;
  if (window == nil) return;
  if ((window.styleMask & NSWindowStyleMaskFullScreen) != 0) return;

  NSButton *close = [window standardWindowButton:NSWindowCloseButton];
  NSButton *mini = [window standardWindowButton:NSWindowMiniaturizeButton];
  NSButton *zoom = [window standardWindowButton:NSWindowZoomButton];
  if (close == nil || mini == nil || zoom == nil) return;

  CGFloat width = NSWidth(close.frame);
  if (width < 1) return;
  CGFloat y = NSMinY(close.frame);
  CGFloat x = originX;
  [close setFrameOrigin:NSMakePoint(x, y)];
  x += width + gap;
  [mini setFrameOrigin:NSMakePoint(x, y)];
  x += width + gap;
  [zoom setFrameOrigin:NSMakePoint(x, y)];
}

void stackferry_place_traffic_lights(uint64_t viewBits, double originX, double gap) {
  void *nsview = (void *)(uintptr_t)viewBits;
  if (nsview == NULL) return;
  if ([NSThread isMainThread]) {
    placeTrafficLights(nsview, originX, gap);
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    placeTrafficLights(nsview, originX, gap);
  });
}
